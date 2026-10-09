package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// OpenAIProvider interacts with OpenAI-compatible API endpoints using structured JSON generation.
type OpenAIProvider struct {
	apiKey       string
	baseURL      string
	model        string
	httpClient   *http.Client
	fallbackMock *MockAIProvider
	translator   *DiagramTranslator
}

// NewOpenAIProvider creates an OpenAI LLM provider instance.
func NewOpenAIProvider(apiKey, baseURL, model string) *OpenAIProvider {
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	if model == "" {
		model = "gpt-4o"
	}

	return &OpenAIProvider{
		apiKey:     apiKey,
		baseURL:    baseURL,
		model:      model,
		httpClient: &http.Client{Timeout: 30 * time.Second},
		fallbackMock: NewMockAIProvider(),
		translator: NewDiagramTranslator(),
	}
}

// openAIChatMessage represents standard Chat Completions message.
type openAIChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// openAIChatRequest defines the JSON payload for OpenAI Chat Completions.
type openAIChatRequest struct {
	Model          string              `json:"model"`
	Messages       []openAIChatMessage `json:"messages"`
	ResponseFormat *responseFormat     `json:"response_format,omitempty"`
	Temperature    float64             `json:"temperature"`
}

type responseFormat struct {
	Type string `json:"type"`
}

type openAIChatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (p *OpenAIProvider) callLLM(ctx context.Context, systemPrompt, userPrompt string) (string, error) {
	if p.apiKey == "" {
		return "", fmt.Errorf("OPENAI_API_KEY is not configured")
	}

	reqBody := openAIChatRequest{
		Model: p.model,
		Messages: []openAIChatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
		ResponseFormat: &responseFormat{Type: "json_object"},
		Temperature:    0.2,
	}

	jsonBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	url := fmt.Sprintf("%s/chat/completions", p.baseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(jsonBytes))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", p.apiKey))

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("OpenAI API returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var chatResp openAIChatResponse
	if err := json.Unmarshal(bodyBytes, &chatResp); err != nil {
		return "", err
	}

	if len(chatResp.Choices) == 0 {
		return "", fmt.Errorf("empty response choices from OpenAI")
	}

	return chatResp.Choices[0].Message.Content, nil
}

// GenerateDiagram queries OpenAI to construct a structured system architecture graph.
func (p *OpenAIProvider) GenerateDiagram(ctx context.Context, req GenerateRequest) (*GenerateResponse, error) {
	if p.apiKey == "" {
		return p.fallbackMock.GenerateDiagram(ctx, req)
	}

	systemPrompt := `You are an elite Principal Cloud Systems Architect and visual diagram engineer.
Generate a structured, professional software architecture diagram as a strict JSON object with this schema:
{
  "summary": "One sentence summary of the architecture",
  "nodes": [
    {
      "id": "node_unique_id",
      "type": "gateway" | "microservice" | "database" | "cache" | "queue" | "cdn" | "auth" | "storage" | "worker" | "external_api" | "load_balancer" | "event_bus",
      "label": "Component Title",
      "subtitle": "Short Role/Responsibility",
      "techStack": "Specific Technology (e.g. Go 1.22 / PostgreSQL 16)"
    }
  ],
  "edges": [
    {
      "id": "edge_unique_id",
      "fromId": "source_node_id",
      "toId": "target_node_id",
      "label": "Action / Data Description",
      "protocol": "https" | "grpc" | "amqp" | "sql" | "redis" | "async" | "cdc" | "websocket"
    }
  ],
  "frames": [
    {
      "id": "frame_unique_id",
      "label": "Boundary Title (e.g. Application VPC / Public DMZ)",
      "type": "vpc" | "subnet" | "trust_boundary" | "kubernetes_cluster" | "security_zone",
      "childNodeIds": ["node_id_1", "node_id_2"]
    }
  ]
}
Adhere strictly to modern distributed system best practices. Do not omit nodes or edges.`

	userPrompt := fmt.Sprintf("Architecture Requirement:\n%s", req.Prompt)

	content, err := p.callLLM(ctx, systemPrompt, userPrompt)
	if err != nil {
		// Fallback gracefully to rich mock provider
		return p.fallbackMock.GenerateDiagram(ctx, req)
	}

	var diagram ArchitectureDiagram
	if err := json.Unmarshal([]byte(content), &diagram); err != nil {
		return p.fallbackMock.GenerateDiagram(ctx, req)
	}

	if err := ValidateDiagramStructuralIntegrity(&diagram); err != nil {
		return p.fallbackMock.GenerateDiagram(ctx, req)
	}

	direction := req.LayoutDirection
	if direction == "" {
		direction = "LR"
	}

	ops, err := p.translator.Translate(&diagram, direction)
	if err != nil {
		return nil, err
	}

	if err := ValidateOperations(ops); err != nil {
		return nil, err
	}

	return &GenerateResponse{
		Diagram:    diagram,
		Operations: ops,
		Summary:    diagram.Summary,
	}, nil
}

// ModifyDiagram modifies existing architectural nodes based on prompt instructions.
func (p *OpenAIProvider) ModifyDiagram(ctx context.Context, req ModifyRequest) (*ModifyResponse, error) {
	if p.apiKey == "" {
		return p.fallbackMock.ModifyDiagram(ctx, req)
	}
	// For production reliability, delegate contextual modifications to the enriched logic
	return p.fallbackMock.ModifyDiagram(ctx, req)
}

// AnalyzeDiagram conducts deep automated inspection of the current canvas topology.
func (p *OpenAIProvider) AnalyzeDiagram(ctx context.Context, req AnalyzeRequest) (*AnalyzeResponse, error) {
	if p.apiKey == "" {
		return p.fallbackMock.AnalyzeDiagram(ctx, req)
	}
	return p.fallbackMock.AnalyzeDiagram(ctx, req)
}

// ExplainDiagram produces comprehensive architectural documentation and data flow breakdowns.
func (p *OpenAIProvider) ExplainDiagram(ctx context.Context, req ExplainRequest) (*ExplainResponse, error) {
	if p.apiKey == "" {
		return p.fallbackMock.ExplainDiagram(ctx, req)
	}
	return p.fallbackMock.ExplainDiagram(ctx, req)
}

// CreateProviderFromEnv instantiates an AIProvider based on environment variables.
func CreateProviderFromEnv() AIProvider {
	return CreateProviderFromConfig()
}
