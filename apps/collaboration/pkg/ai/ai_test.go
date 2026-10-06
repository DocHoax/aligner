package ai_test

import (
	"context"
	"strings"
	"testing"

	"alignify/collaboration/pkg/ai"
)

func TestMockAIProvider_GenerateDiagram(t *testing.T) {
	provider := ai.NewMockAIProvider()
	ctx := context.Background()

	testCases := []struct {
		name         string
		prompt       string
		direction    string
		minNodes     int
		minEdges     int
		minFrames    int
		expectedTech string
	}{
		{
			name:         "E-Commerce Architecture",
			prompt:       "Build an e-commerce microservices platform with postgres, redis, and payment processing",
			direction:    "LR",
			minNodes:     6,
			minEdges:     6,
			minFrames:    1,
			expectedTech: "PostgreSQL",
		},
		{
			name:         "Fintech Payment Gateway",
			prompt:       "Design a PCI-DSS compliant fintech payment gateway architecture with tokenization and fraud detection",
			direction:    "TB",
			minNodes:     5,
			minEdges:     5,
			minFrames:    1,
			expectedTech: "PCI-DSS",
		},
		{
			name:         "Event-Driven Streaming",
			prompt:       "Build real-time event-driven streaming data pipeline with kafka and clickhouse",
			direction:    "LR",
			minNodes:     5,
			minEdges:     5,
			minFrames:    1,
			expectedTech: "Kafka",
		},
		{
			name:         "3-Tier Web Application",
			prompt:       "Standard 3-tier web app with React frontend, Go backend, and Postgres database",
			direction:    "TB",
			minNodes:     4,
			minEdges:     3,
			minFrames:    1,
			expectedTech: "PostgreSQL",
		},
		{
			name:         "Generic Architecture Fallback",
			prompt:       "Design an internal tooling metrics collector service",
			direction:    "LR",
			minNodes:     3,
			minEdges:     2,
			minFrames:    0,
			expectedTech: "",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := ai.GenerateRequest{
				Prompt:          tc.prompt,
				LayoutDirection: tc.direction,
			}

			resp, err := provider.GenerateDiagram(ctx, req)
			if err != nil {
				t.Fatalf("GenerateDiagram failed: %v", err)
			}

			if resp == nil {
				t.Fatal("Expected non-nil GenerateResponse")
			}

			if len(resp.Diagram.Nodes) < tc.minNodes {
				t.Errorf("Expected at least %d nodes, got %d", tc.minNodes, len(resp.Diagram.Nodes))
			}

			if len(resp.Diagram.Edges) < tc.minEdges {
				t.Errorf("Expected at least %d edges, got %d", tc.minEdges, len(resp.Diagram.Edges))
			}

			if len(resp.Diagram.Frames) < tc.minFrames {
				t.Errorf("Expected at least %d frames, got %d", tc.minFrames, len(resp.Diagram.Frames))
			}

			if len(resp.Operations) == 0 {
				t.Error("Expected generated DocumentOperations, got empty slice")
			}

			// Validate generated operations
			if err := ai.ValidateOperations(resp.Operations); err != nil {
				t.Errorf("Generated operations failed validation: %v", err)
			}
		})
	}
}

func TestMockAIProvider_ModifyDiagram(t *testing.T) {
	provider := ai.NewMockAIProvider()
	ctx := context.Background()

	// Base existing objects representing a simple API + DB
	existingObjs := []map[string]interface{}{
		{
			"id":     "node_api",
			"type":   "rectangle",
			"x":      100.0,
			"y":      100.0,
			"width":  160.0,
			"height": 72.0,
			"metadata": map[string]interface{}{
				"label": "API Service",
			},
		},
		{
			"id":     "node_db",
			"type":   "rectangle",
			"x":      400.0,
			"y":      100.0,
			"width":  160.0,
			"height": 72.0,
			"metadata": map[string]interface{}{
				"label": "Primary DB",
			},
		},
	}

	testCases := []struct {
		name            string
		prompt          string
		expectedAdded   bool
		expectedOpCount int
	}{
		{
			name:            "Add Redis Cache",
			prompt:          "Add Redis caching layer to reduce database query load",
			expectedAdded:   true,
			expectedOpCount: 2,
		},
		{
			name:            "Add Kafka Queue",
			prompt:          "Introduce Kafka event bus for async worker processing",
			expectedAdded:   true,
			expectedOpCount: 2,
		},
		{
			name:            "Add Load Balancer",
			prompt:          "Place an ingress load balancer in front of API service",
			expectedAdded:   true,
			expectedOpCount: 2,
		},
		{
			name:            "Add Security Boundary",
			prompt:          "Group services into a private VPC subnet frame",
			expectedAdded:   true,
			expectedOpCount: 1,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := ai.ModifyRequest{
				Prompt:          tc.prompt,
				ExistingObjects: existingObjs,
			}

			resp, err := provider.ModifyDiagram(ctx, req)
			if err != nil {
				t.Fatalf("ModifyDiagram failed: %v", err)
			}

			if resp == nil {
				t.Fatal("Expected non-nil ModifyResponse")
			}

			if tc.expectedAdded && len(resp.AddedNodeIDs) == 0 && len(resp.Operations) == 0 {
				t.Errorf("Expected added nodes/operations for prompt '%s'", tc.prompt)
			}

			if err := ai.ValidateOperations(resp.Operations); err != nil {
				t.Errorf("Modify operations failed validation: %v", err)
			}
		})
	}
}

func TestMockAIProvider_AnalyzeDiagram(t *testing.T) {
	provider := ai.NewMockAIProvider()
	ctx := context.Background()

	// Diagram with a Single Point of Failure (single DB, no cache, unbuffered)
	spofObjects := []map[string]interface{}{
		{
			"id":     "gateway_1",
			"type":   "rectangle",
			"x":      100.0,
			"y":      100.0,
			"width":  160.0,
			"height": 72.0,
			"metadata": map[string]interface{}{
				"label": "API Gateway",
			},
		},
		{
			"id":     "db_1",
			"type":   "rectangle",
			"x":      400.0,
			"y":      100.0,
			"width":  160.0,
			"height": 72.0,
			"metadata": map[string]interface{}{
				"label": "PostgreSQL DB",
			},
		},
		{
			"id":     "arrow_1",
			"type":   "arrow",
			"x":      260.0,
			"y":      136.0,
			"x2":     400.0,
			"y2":     136.0,
			"metadata": map[string]interface{}{
				"fromId":   "gateway_1",
				"toId":     "db_1",
				"protocol": "sql",
			},
		},
	}

	req := ai.AnalyzeRequest{
		Objects: spofObjects,
	}

	resp, err := provider.AnalyzeDiagram(ctx, req)
	if err != nil {
		t.Fatalf("AnalyzeDiagram failed: %v", err)
	}

	if resp == nil || resp.Report == nil {
		t.Fatal("Expected non-nil AnalysisReport")
	}

	if resp.Report.OverallScore <= 0 || resp.Report.OverallScore > 100 {
		t.Errorf("Expected score between 1 and 100, got %d", resp.Report.OverallScore)
	}

	if len(resp.Report.Findings) == 0 {
		t.Error("Expected architectural findings for single database setup")
	}

	hasSpofFinding := false
	for _, finding := range resp.Report.Findings {
		if finding.Category == ai.FindingCategorySPOF || strings.Contains(strings.ToLower(finding.Title), "spof") || strings.Contains(strings.ToLower(finding.Title), "database") {
			hasSpofFinding = true
			break
		}
	}

	if !hasSpofFinding {
		t.Logf("Found %d findings: %+v", len(resp.Report.Findings), resp.Report.Findings)
	}
}

func TestMockAIProvider_ExplainDiagram(t *testing.T) {
	provider := ai.NewMockAIProvider()
	ctx := context.Background()

	objects := []map[string]interface{}{
		{
			"id":     "svc_1",
			"type":   "rectangle",
			"x":      100.0,
			"y":      100.0,
			"width":  160.0,
			"height": 72.0,
			"metadata": map[string]interface{}{
				"label": "Order Service",
			},
		},
	}

	req := ai.ExplainRequest{
		Prompt:  "How does data flow through this system and what are the failure modes?",
		Objects: objects,
	}

	resp, err := provider.ExplainDiagram(ctx, req)
	if err != nil {
		t.Fatalf("ExplainDiagram failed: %v", err)
	}

	if resp == nil || resp.Explanation == nil {
		t.Fatal("Expected non-nil ArchitectureExplanation")
	}

	if resp.Explanation.Overview == "" {
		t.Error("Expected non-empty explanation Overview")
	}

	if len(resp.Explanation.DataFlows) == 0 {
		t.Error("Expected at least one data flow step")
	}
}

func TestMermaidEngine_ExportAndImport(t *testing.T) {
	engine := ai.NewMermaidEngine()

	// 1. Test Export to Mermaid
	canvasObjects := []map[string]interface{}{
		{
			"id":     "node_gateway",
			"type":   "rectangle",
			"x":      100.0,
			"y":      100.0,
			"width":  160.0,
			"height": 72.0,
			"metadata": map[string]interface{}{
				"label": "API Gateway",
			},
		},
		{
			"id":     "node_auth",
			"type":   "rectangle",
			"x":      350.0,
			"y":      100.0,
			"width":  160.0,
			"height": 72.0,
			"metadata": map[string]interface{}{
				"label": "Auth Service",
			},
		},
		{
			"id":     "arrow_gw_auth",
			"type":   "arrow",
			"x":      260.0,
			"y":      136.0,
			"x2":     350.0,
			"y2":     136.0,
			"metadata": map[string]interface{}{
				"fromId":   "node_gateway",
				"toId":     "node_auth",
				"protocol": "https",
			},
		},
	}

	mermaidText, err := engine.ExportToMermaid(canvasObjects, "LR")
	if err != nil {
		t.Fatalf("ExportToMermaid failed: %v", err)
	}

	if !strings.Contains(mermaidText, "flowchart LR") {
		t.Errorf("Expected flowchart LR header, got:\n%s", mermaidText)
	}

	if !strings.Contains(mermaidText, "API Gateway") || !strings.Contains(mermaidText, "Auth Service") {
		t.Errorf("Expected node labels in mermaid output, got:\n%s", mermaidText)
	}

	// 2. Test Import from Mermaid
	mermaidInput := `flowchart LR
    subgraph VPC_App ["Production VPC"]
        GW["API Gateway"]
        Auth["Auth Service"]
        DB[("PostgreSQL DB")]
    end

    GW -->|"HTTPS"| Auth
    Auth -->|"SQL"| DB
`

	importResp, err := engine.ImportFromMermaid(mermaidInput)
	if err != nil {
		t.Fatalf("ImportFromMermaid failed: %v", err)
	}

	if importResp == nil {
		t.Fatal("Expected non-nil GenerateResponse from Mermaid import")
	}

	if len(importResp.Diagram.Nodes) != 3 {
		t.Errorf("Expected 3 nodes imported from Mermaid, got %d", len(importResp.Diagram.Nodes))
	}

	if len(importResp.Diagram.Edges) != 2 {
		t.Errorf("Expected 2 edges imported from Mermaid, got %d", len(importResp.Diagram.Edges))
	}

	if len(importResp.Diagram.Frames) != 1 {
		t.Errorf("Expected 1 frame imported from Mermaid, got %d", len(importResp.Diagram.Frames))
	}

	if len(importResp.Operations) == 0 {
		t.Error("Expected DocumentOperations generated from Mermaid import")
	}

	if err := ai.ValidateOperations(importResp.Operations); err != nil {
		t.Errorf("Imported operations failed validation: %v", err)
	}
}

func TestValidator_SafetyGuards(t *testing.T) {
	// 1. Max operations safety cap
	tooManyOps := make([]map[string]interface{}, 250)
	for i := range tooManyOps {
		tooManyOps[i] = map[string]interface{}{
			"op":   "create",
			"type": "rectangle",
			"id":   "obj_1",
			"x":    10.0,
			"y":    10.0,
		}
	}

	if err := ai.ValidateOperations(tooManyOps); err == nil {
		t.Error("Expected error when exceeding max operations limit, got nil")
	}

	// 2. Coordinate bounds check
	outOfBoundsOp := []map[string]interface{}{
		{
			"op":     "create",
			"type":   "rectangle",
			"id":     "obj_oob",
			"x":      500000.0,
			"y":      10.0,
			"width":  100.0,
			"height": 100.0,
		},
	}

	if err := ai.ValidateOperations(outOfBoundsOp); err == nil {
		t.Error("Expected error for out of bounds coordinates, got nil")
	}

	// 3. Invalid object type
	invalidTypeOp := []map[string]interface{}{
		{
			"op":     "create",
			"type":   "malicious_script_tag",
			"id":     "obj_bad",
			"x":      10.0,
			"y":      10.0,
			"width":  100.0,
			"height": 100.0,
		},
	}

	if err := ai.ValidateOperations(invalidTypeOp); err == nil {
		t.Error("Expected error for invalid object type, got nil")
	}

	// 4. Structural integrity: dangling edge
	brokenDiagram := &ai.ArchitectureDiagram{
		Nodes: []ai.ArchitectureNode{
			{ID: "node_1", Label: "Service 1"},
		},
		Edges: []ai.ArchitectureEdge{
			{ID: "edge_1", FromID: "node_1", ToID: "node_nonexistent"},
		},
	}

	if err := ai.ValidateDiagramStructuralIntegrity(brokenDiagram); err == nil {
		t.Error("Expected error for dangling edge reference, got nil")
	}
}
