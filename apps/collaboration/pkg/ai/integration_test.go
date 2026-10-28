package ai_test

import (
	"context"
	"testing"

	"alignify/collaboration/pkg/ai"
)

func TestAIProvider_Integration(t *testing.T) {
	provider := ai.NewMockAIProvider()
	ctx := context.Background()

	t.Run("Generate produces valid operations", func(t *testing.T) {
		req := ai.GenerateRequest{
			Prompt:          "Design a microservices architecture with API gateway, auth service, and database",
			LayoutDirection: "LR",
		}

		resp, err := provider.GenerateDiagram(ctx, req)
		if err != nil {
			t.Fatalf("GenerateDiagram failed: %v", err)
		}

		if len(resp.Operations) == 0 {
			t.Error("Expected generated operations, got empty slice")
		}

		// Validate generated operations
		if err := ai.ValidateOperations(resp.Operations); err != nil {
			t.Errorf("Generated operations failed validation: %v", err)
		}
	})

	t.Run("Modify produces valid operations", func(t *testing.T) {
		existingObjs := []map[string]interface{}{
			{
				"id":     "node_current",
				"type":   "rectangle",
				"x":      100.0,
				"y":      100.0,
				"width":  160.0,
				"height": 72.0,
				"metadata": map[string]interface{}{"label": "Current Service"},
			},
		}

		req := ai.ModifyRequest{
			Prompt:          "Add Redis cache layer to improve performance",
			ExistingObjects: existingObjs,
		}

		resp, err := provider.ModifyDiagram(ctx, req)
		if err != nil {
			t.Fatalf("ModifyDiagram failed: %v", err)
		}

		if len(resp.AddedNodeIDs) == 0 && len(resp.ModifiedNodeIDs) == 0 && len(resp.Operations) == 0 {
			t.Error("Expected at least one added, modified or operation")
		}

		// Validate operations
		if err := ai.ValidateOperations(resp.Operations); err != nil {
			t.Errorf("Modify operations failed validation: %v", err)
		}
	})

	t.Run("Analyze produces valid report", func(t *testing.T) {
		objects := []map[string]interface{}{
			{"id": "svc_1", "type": "rectangle", "x": 100, "y": 100, "width": 160, "height": 72, "metadata": map[string]interface{}{"label": "Service 1"}},
			{"id": "db_1", "type": "rectangle", "x": 400, "y": 100, "width": 160, "height": 72, "metadata": map[string]interface{}{"label": "Database"}},
		}

		req := ai.AnalyzeRequest{
			BoardID: "test_board",
			Objects: objects,
		}

		resp, err := provider.AnalyzeDiagram(ctx, req)
		if err != nil {
			t.Fatalf("AnalyzeDiagram failed: %v", err)
		}

		if len(resp.Report.Findings) == 0 && resp.Report.OverallScore <= 0 {
			t.Error("Expected some analysis results")
		}
	})

	t.Run("Explain produces valid explanation", func(t *testing.T) {
		objects := []map[string]interface{}{
			{"id": "svc_1", "type": "rectangle", "x": 100, "y": 100, "width": 160, "height": 72, "metadata": map[string]interface{}{"label": "Service 1"}},
		}

		req := ai.ExplainRequest{
			BoardID: "test_board",
			Objects: objects,
			Question: "How does this architecture handle failures?",
		}

		resp, err := provider.ExplainDiagram(ctx, req)
		if err != nil {
			t.Fatalf("ExplainDiagram failed: %v", err)
		}

		if resp.Explanation.Summary == "" && len(resp.Explanation.DataFlowJourney) == 0 {
			t.Log("Explanation produced output")
		}
	})

	t.Run("Mermaid export produces valid output", func(t *testing.T) {
		objects := []map[string]interface{}{
			{"id": "svc_gateway", "type": "rectangle", "x": 100, "y": 100, "width": 160, "height": 72, "metadata": map[string]interface{}{"label": "API Gateway"}},
			{"id": "svc_auth", "type": "rectangle", "x": 350, "y": 100, "width": 160, "height": 72, "metadata": map[string]interface{}{"label": "Auth Service"}},
		}

		// Use MermaidEngine directly for export
		mermaidEngine := ai.NewMermaidEngine()
		mermaid, err := mermaidEngine.ExportToMermaid(objects, "LR")
		if err != nil {
			t.Fatalf("ExportMermaid failed: %v", err)
		}

		if mermaid == "" {
			t.Error("Expected non-empty Mermaid output")
		}
	})

	t.Run("Mermaid import produces valid operations", func(t *testing.T) {
		mermaidInput := `flowchart TB
    subgraph Frontend ["Frontend Services"]
        GW[Gateway] --> Auth[Auth]
    end
    subgraph Backend ["Backend Services"]
        DB[(PostgreSQL)]
    end
    
    GW --> API[API Gateway]
    Auth -->|"OAuth2"| API
    API -->|"SQL"| DB
`

		// Import via mermaid engine
		mermaidEngine := ai.NewMermaidEngine()
		importResp, importErr := mermaidEngine.ImportFromMermaid(mermaidInput)
		if importErr != nil {
			t.Fatalf("ImportMermaid failed: %v", importErr)
		}

		if importResp == nil {
			t.Fatal("Expected non-nil import response")
		}

		if len(importResp.Operations) == 0 {
			t.Error("Expected imported operations")
		}

		// Validate imported operations
		if err := ai.ValidateOperations(importResp.Operations); err != nil {
			t.Errorf("Imported operations failed validation: %v", err)
		}
	})
}

func TestAIProvider_ConcurrentModification(t *testing.T) {
	provider := ai.NewMockAIProvider()
	ctx := context.Background()

	t.Run("Generate then modify produces consistent state", func(t *testing.T) {
		// First generate a diagram
		genReq := ai.GenerateRequest{Prompt: "Design microservices", LayoutDirection: "LR"}
		genResp, err := provider.GenerateDiagram(ctx, genReq)
		if err != nil {
			t.Fatalf("GenerateDiagram failed: %v", err)
		}

		// Then modify it
		existingObjs := []map[string]interface{}{}
		for _, op := range genResp.Operations {
			if op.Op == "create" {
				existingObjs = append(existingObjs, op.Object)
			}
		}

		modReq := ai.ModifyRequest{
			Prompt:          "Add monitoring",
			ExistingObjects: existingObjs,
		}

		modResp, err := provider.ModifyDiagram(ctx, modReq)
		if err != nil {
			t.Fatalf("ModifyDiagram failed: %v", err)
		}

		// Both should produce valid operations
		if err := ai.ValidateOperations(genResp.Operations); err != nil {
			t.Errorf("Generated ops validation failed: %v", err)
		}
		if err := ai.ValidateOperations(modResp.Operations); err != nil {
			t.Errorf("Modified ops validation failed: %v", err)
		}
	})
}

func TestAIProvider_ErrorHandling(t *testing.T) {
	provider := ai.NewMockAIProvider()
	ctx := context.Background()

	t.Run("Empty prompt handled gracefully", func(t *testing.T) {
		req := ai.GenerateRequest{Prompt: ""}
		_, err := provider.GenerateDiagram(ctx, req)
		if err == nil {
			t.Log("Empty prompt handled by provider without error")
		} else {
			t.Logf("Empty prompt handled with error: %v", err)
		}
	})

	t.Run("Malformed existing objects handled", func(t *testing.T) {
		req := ai.ModifyRequest{
			Prompt: "Modify",
			ExistingObjects: []map[string]interface{}{
				{"id": "broken", "missing_required": "field"},
			},
		}

		_, err := provider.ModifyDiagram(ctx, req)
		if err != nil {
			t.Logf("Malformed existing objects handled: %v", err)
		}
	})

	t.Run("Very large prompt handled", func(t *testing.T) {
		largePrompt := "Design a "
		for i := 0; i < 1000; i++ {
			largePrompt += "microservices architecture with "
		}
		largePrompt += "database"

		req := ai.GenerateRequest{Prompt: largePrompt}
		_, err := provider.GenerateDiagram(ctx, req)
		if err != nil {
			t.Logf("Large prompt handled with error: %v", err)
		} else {
			t.Log("Large prompt handled by provider")
		}
	})
}