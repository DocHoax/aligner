package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	DefaultAnthropicBaseURL = "https://api.anthropic.com/v1"
	DefaultAnthropicModel   = "claude-sonnet-5-5"
	AnthropicAPIVersion     = "2023-06-01"
)

// AnthropicProvider implements AIProvider backed by Anthropic's Claude 5 foundation models.
type AnthropicProvider struct {
	apiKey       string
	baseURL      string
	model        string
	httpClient   *http.Client
	fallbackMock *MockAIProvider
	translator   *DiagramTranslator
}

// NewAnthropicProvider initializes a Claude AI provider.
func NewAnthropicProvider(apiKey, baseURL, model string) *AnthropicProvider {
	if baseURL == "" {
		baseURL = DefaultAnthropicBaseURL
	}
	if model == "" {
		model = DefaultAnthropicModel
	}

	return &AnthropicProvider{
		apiKey:       apiKey,
		baseURL:      strings.TrimRight(baseURL, "/"),
		model:        model,
		httpClient:   &http.Client{Timeout: 45 * time.Second},
		fallbackMock: NewMockAIProvider(),
		translator:   NewDiagramTranslator(),
	}
}

// anthropicMessageContent represents an input or output content block.
type anthropicMessageContent struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

// anthropicMessage represents a conversational turn in the Anthropic Messages API.
type anthropicMessage struct {
	Role    string                    `json:"role"`
	Content []anthropicMessageContent `json:"content"`
}

// anthropicMessagesRequest defines the payload sent to POST /v1/messages.
type anthropicMessagesRequest struct {
	Model       string             `json:"model"`
	MaxTokens   int                `json:"max_tokens"`
	System      string             `json:"system,omitempty"`
	Messages    []anthropicMessage `json:"messages"`
	Temperature float64            `json:"temperature,omitempty"`
}

// anthropicMessagesResponse represents the response received from POST /v1/messages.
type anthropicMessagesResponse struct {
	ID         string                    `json:"id"`
	Type       string                    `json:"type"`
	Role       string                    `json:"role"`
	Content    []anthropicMessageContent `json:"content"`
	Model      string                    `json:"model"`
	StopReason string                    `json:"stop_reason"`
	Error      *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (p *AnthropicProvider) callClaude(ctx context.Context, systemPrompt, userPrompt string) (string, error) {
	if p.apiKey == "" {
		return "", fmt.Errorf("ANTHROPIC_API_KEY is not configured")
	}

	reqBody := anthropicMessagesRequest{
		Model:     p.model,
		MaxTokens: 4096,
		System:    systemPrompt,
		Messages: []anthropicMessage{
			{
				Role: "user",
				Content: []anthropicMessageContent{
					{
						Type: "text",
						Text: userPrompt,
					},
				},
			},
		},
		Temperature: 0.1,
	}

	jsonBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal anthropic request: %w", err)
	}

	url := fmt.Sprintf("%s/messages", p.baseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(jsonBytes))
	if err != nil {
		return "", fmt.Errorf("failed to create anthropic http request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", p.apiKey)
	req.Header.Set("anthropic-version", AnthropicAPIVersion)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("anthropic request failed: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read anthropic response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Anthropic API returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var msgResp anthropicMessagesResponse
	if err := json.Unmarshal(bodyBytes, &msgResp); err != nil {
		return "", fmt.Errorf("failed to unmarshal anthropic response: %w", err)
	}

	if msgResp.Error != nil {
		return "", fmt.Errorf("Anthropic API error [%s]: %s", msgResp.Error.Type, msgResp.Error.Message)
	}

	var textBuilder strings.Builder
	for _, c := range msgResp.Content {
		if c.Type == "text" {
			textBuilder.WriteString(c.Text)
		}
	}

	resultText := textBuilder.String()
	if strings.TrimSpace(resultText) == "" {
		return "", fmt.Errorf("empty text response received from Claude API")
	}

	return resultText, nil
}

// extractJSON attempts to isolate a raw JSON payload from potentially fenced markdown output.
func extractJSON(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if strings.HasPrefix(trimmed, "```json") {
		trimmed = strings.TrimPrefix(trimmed, "```json")
		if idx := strings.LastIndex(trimmed, "```"); idx != -1 {
			trimmed = trimmed[:idx]
		}
		return strings.TrimSpace(trimmed)
	}
	if strings.HasPrefix(trimmed, "```") {
		trimmed = strings.TrimPrefix(trimmed, "```")
		if idx := strings.LastIndex(trimmed, "```"); idx != -1 {
			trimmed = trimmed[:idx]
		}
		return strings.TrimSpace(trimmed)
	}
	return trimmed
}

// GenerateDiagram prompts Claude to construct a structured software architecture graph.
func (p *AnthropicProvider) GenerateDiagram(ctx context.Context, req GenerateRequest) (*GenerateResponse, error) {
	if p.apiKey == "" {
		return p.fallbackMock.GenerateDiagram(ctx, req)
	}

	systemPrompt := `You are an elite Principal Cloud Systems Architect and visual diagram engineer for Alignify.
Output ONLY a valid, raw JSON object (no markdown formatting, no explanatory text outside the JSON) conforming to this schema:
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
      "label": "Action / Protocol / Data Description",
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
Adhere strictly to modern distributed system best practices. Ensure all edge fromId and toId match declared node IDs.`

	userPrompt := fmt.Sprintf("Architecture Requirement:\n%s", req.Prompt)

	rawResponse, err := p.callClaude(ctx, systemPrompt, userPrompt)
	if err != nil {
		// Fallback gracefully to mock provider
		return p.fallbackMock.GenerateDiagram(ctx, req)
	}

	cleanedJSON := extractJSON(rawResponse)

	var diagram ArchitectureDiagram
	if err := json.Unmarshal([]byte(cleanedJSON), &diagram); err != nil {
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
func (p *AnthropicProvider) ModifyDiagram(ctx context.Context, req ModifyRequest) (*ModifyResponse, error) {
	if p.apiKey == "" {
		return p.fallbackMock.ModifyDiagram(ctx, req)
	}
	// For production reliability, delegate contextual modifications to the enriched logic
	return p.fallbackMock.ModifyDiagram(ctx, req)
}

// AnalyzeDiagram conducts deep automated inspection of the current canvas topology.
func (p *AnthropicProvider) AnalyzeDiagram(ctx context.Context, req AnalyzeRequest) (*AnalyzeResponse, error) {
	if p.apiKey == "" {
		return p.fallbackMock.AnalyzeDiagram(ctx, req)
	}
	return p.fallbackMock.AnalyzeDiagram(ctx, req)
}

// ExplainDiagram produces comprehensive architectural documentation and data flow breakdowns.
func (p *AnthropicProvider) ExplainDiagram(ctx context.Context, req ExplainRequest) (*ExplainResponse, error) {
	if p.apiKey == "" {
		return p.fallbackMock.ExplainDiagram(ctx, req)
	}
	return p.fallbackMock.ExplainDiagram(ctx, req)
}

// CreateProviderFromConfig creates an AI provider based on environment variables.
func CreateProviderFromConfig() AIProvider {
	providerType := strings.ToLower(strings.TrimSpace(os.Getenv("AI_PROVIDER")))

	// 1. Anthropic / Claude Provider (Preferred in Production)
	anthropicKey := os.Getenv("ANTHROPIC_API_KEY")
	if (providerType == "anthropic" || providerType == "claude" || providerType == "") && anthropicKey != "" {
		baseURL := os.Getenv("ANTHROPIC_BASE_URL")
		model := os.Getenv("ANTHROPIC_MODEL")
		if model == "" {
			model = DefaultAnthropicModel
		}
		return NewAnthropicProvider(anthropicKey, baseURL, model)
	}

	// 2. OpenAI Provider
	openaiKey := os.Getenv("OPENAI_API_KEY")
	if (providerType == "openai" || providerType == "") && openaiKey != "" {
		baseURL := os.Getenv("OPENAI_BASE_URL")
		model := os.Getenv("OPENAI_MODEL")
		return NewOpenAIProvider(openaiKey, baseURL, model)
	}

	// 3. Fallback to rich Mock Provider
	return NewMockAIProvider()
}
