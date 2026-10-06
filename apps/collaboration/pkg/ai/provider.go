package ai

import (
	"context"
	"time"

	"alignify/collaboration/pkg/protocol"
)

// ArchitectureNodeType defines standard architectural component classifications.
type ArchitectureNodeType string

const (
	NodeGateway      ArchitectureNodeType = "gateway"
	NodeMicroservice ArchitectureNodeType = "microservice"
	NodeDatabase     ArchitectureNodeType = "database"
	NodeCache        ArchitectureNodeType = "cache"
	NodeQueue        ArchitectureNodeType = "queue"
	NodeCDN          ArchitectureNodeType = "cdn"
	NodeAuth         ArchitectureNodeType = "auth"
	NodeStorage      ArchitectureNodeType = "storage"
	NodeWorker       ArchitectureNodeType = "worker"
	NodeExternalAPI  ArchitectureNodeType = "external_api"
	NodeLoadBalancer ArchitectureNodeType = "load_balancer"
	NodeEventBus     ArchitectureNodeType = "event_bus"
)

// ArchitectureNode represents a high-level system component.
type ArchitectureNode struct {
	ID          string                 `json:"id"`
	Type        ArchitectureNodeType   `json:"type"`
	Label       string                 `json:"label"`
	Subtitle    string                 `json:"subtitle,omitempty"`
	TechStack   string                 `json:"techStack,omitempty"`
	X           float64                `json:"x"`
	Y           float64                `json:"y"`
	Width       float64                `json:"width"`
	Height      float64                `json:"height"`
	FillColor   string                 `json:"fillColor,omitempty"`
	StrokeColor string                 `json:"strokeColor,omitempty"`
	TextColor   string                 `json:"textColor,omitempty"`
	Icon        string                 `json:"icon,omitempty"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}

// ArchitectureEdgeProtocol specifies communication protocols.
type ArchitectureEdgeProtocol string

const (
	ProtocolHTTPS ArchitectureEdgeProtocol = "https"
	ProtocolGRPC  ArchitectureEdgeProtocol = "grpc"
	ProtocolAMQP  ArchitectureEdgeProtocol = "amqp"
	ProtocolSQL   ArchitectureEdgeProtocol = "sql"
	ProtocolRedis ArchitectureEdgeProtocol = "redis"
	ProtocolAsync ArchitectureEdgeProtocol = "async"
	ProtocolCDC   ArchitectureEdgeProtocol = "cdc"
	ProtocolTCP   ArchitectureEdgeProtocol = "tcp"
	ProtocolWS    ArchitectureEdgeProtocol = "websocket"
)

// ArchitectureEdge represents a connection or communication channel between components.
type ArchitectureEdge struct {
	ID        string                   `json:"id"`
	FromID    string                   `json:"fromId"`
	ToID      string                   `json:"toId"`
	Label     string                   `json:"label,omitempty"`
	Protocol  ArchitectureEdgeProtocol `json:"protocol,omitempty"`
	Direction string                   `json:"direction,omitempty"` // "unidirectional" | "bidirectional"
	Style     string                   `json:"style,omitempty"`     // "solid" | "dashed" | "dotted"
	Color     string                   `json:"color,omitempty"`
}

// ArchitectureFrameType defines architectural boundary categories.
type ArchitectureFrameType string

const (
	FrameVPC          ArchitectureFrameType = "vpc"
	FrameSubnet       ArchitectureFrameType = "subnet"
	FrameTrustZone    ArchitectureFrameType = "trust_boundary"
	FrameRegion       ArchitectureFrameType = "region"
	FrameK8sCluster   ArchitectureFrameType = "kubernetes_cluster"
	FrameSecurityZone ArchitectureFrameType = "security_zone"
	FrameServiceGroup ArchitectureFrameType = "service_group"
)

// ArchitectureFrame represents a visual boundary or containment grouping.
type ArchitectureFrame struct {
	ID          string                `json:"id"`
	Label       string                `json:"label"`
	Type        ArchitectureFrameType `json:"type"`
	ChildNodeIDs []string              `json:"childNodeIds"`
	X           float64               `json:"x"`
	Y           float64               `json:"y"`
	Width       float64               `json:"width"`
	Height      float64               `json:"height"`
	FillColor   string                `json:"fillColor,omitempty"`
	StrokeColor string                `json:"strokeColor,omitempty"`
	StrokeStyle string                `json:"strokeStyle,omitempty"`
}

// ArchitectureDiagram represents a structured graph model of an entire system architecture.
type ArchitectureDiagram struct {
	Nodes   []ArchitectureNode  `json:"nodes"`
	Edges   []ArchitectureEdge  `json:"edges"`
	Frames  []ArchitectureFrame `json:"frames"`
	Summary string              `json:"summary,omitempty"`
}

// Severity levels for architectural inspection findings.
type FindingSeverity string

const (
	SeverityCritical FindingSeverity = "critical"
	SeverityHigh     FindingSeverity = "high"
	SeverityMedium   FindingSeverity = "medium"
	SeverityLow      FindingSeverity = "low"
	SeverityInfo     FindingSeverity = "info"
)

// Category categories for architectural inspection findings.
type FindingCategory string

const (
	CategorySPOF        FindingCategory = "spof"
	CategorySecurity    FindingCategory = "security"
	CategoryPerformance FindingCategory = "performance"
	CategoryCoupling    FindingCategory = "coupling"
	CategoryReliability FindingCategory = "reliability"
	CategoryScalability FindingCategory = "scalability"
)

// ArchitectureFinding represents an actionable insight or potential risk identified by AI.
type ArchitectureFinding struct {
	ID              string           `json:"id"`
	RuleID          string           `json:"ruleId"`
	Title           string           `json:"title"`
	Severity        FindingSeverity  `json:"severity"`
	Category        FindingCategory  `json:"category"`
	Description     string           `json:"description"`
	Recommendation  string           `json:"recommendation"`
	AffectedNodeIDs []string         `json:"affectedNodeIds"`
	AffectedEdgeIDs []string         `json:"affectedEdgeIds"`
	Position        *protocol.Point  `json:"position,omitempty"`
}

// AnalysisReport represents the complete automated architectural audit.
type AnalysisReport struct {
	BoardID        string                `json:"boardId"`
	OverallScore   float64               `json:"overallScore"` // 0 to 100
	Summary        string                `json:"summary"`
	Findings       []ArchitectureFinding `json:"findings"`
	CriticalCount  int                   `json:"criticalCount"`
	HighCount      int                   `json:"highCount"`
	MediumCount    int                   `json:"mediumCount"`
	LowCount       int                   `json:"lowCount"`
	InfoCount      int                   `json:"infoCount"`
	AnalyzedAt     time.Time             `json:"analyzedAt"`
}

// ArchitectureExplanation represents a deep technical breakdown of a system design.
type ArchitectureExplanation struct {
	Summary                string   `json:"summary"`
	DataFlowJourney        []string `json:"dataFlowJourney"`
	FailureModes           []string `json:"failureModes"`
	ScalingCharacteristics []string `json:"scalingCharacteristics"`
	SecurityBoundaries     []string `json:"securityBoundaries"`
	FullText               string   `json:"fullText"`
}

// GenerateRequest defines inputs for diagram creation.
type GenerateRequest struct {
	BoardID         string `json:"boardId"`
	Prompt          string `json:"prompt"`
	LayoutDirection string `json:"layoutDirection,omitempty"` // "LR" or "TB"
	StylePreset     string `json:"stylePreset,omitempty"`     // "modern", "minimal", "enterprise"
}

// GenerateResponse defines outputs for diagram creation.
type GenerateResponse struct {
	Diagram    ArchitectureDiagram          `json:"diagram"`
	Operations []protocol.DocumentOperation `json:"operations"`
	Summary    string                       `json:"summary"`
}

// ModifyRequest defines inputs for context-aware diagram refinement.
type ModifyRequest struct {
	BoardID         string                   `json:"boardId"`
	Prompt          string                   `json:"prompt"`
	ExistingObjects []map[string]interface{} `json:"existingObjects"`
	SelectedIDs     []string                 `json:"selectedIds,omitempty"`
}

// ModifyResponse defines outputs for diagram modification with granular diff indicators.
type ModifyResponse struct {
	Diagram         ArchitectureDiagram          `json:"diagram"`
	Operations      []protocol.DocumentOperation `json:"operations"`
	AddedNodeIDs    []string                     `json:"addedNodeIds"`
	ModifiedNodeIDs []string                     `json:"modifiedNodeIds"`
	DeletedNodeIDs  []string                     `json:"deletedNodeIds"`
	Summary         string                       `json:"summary"`
}

// AnalyzeRequest defines inputs for architectural analysis.
type AnalyzeRequest struct {
	BoardID string                   `json:"boardId"`
	Objects []map[string]interface{} `json:"objects"`
}

// AnalyzeResponse defines outputs for architectural analysis.
type AnalyzeResponse struct {
	Report AnalysisReport `json:"report"`
}

// ExplainRequest defines inputs for diagram explanation.
type ExplainRequest struct {
	BoardID  string                   `json:"boardId"`
	Objects  []map[string]interface{} `json:"objects"`
	Question string                   `json:"question,omitempty"`
}

// ExplainResponse defines outputs for diagram explanation.
type ExplainResponse struct {
	Explanation ArchitectureExplanation `json:"explanation"`
}

// AIProvider defines the contract for AI intelligence backends (Mock, OpenAI, Claude, etc.).
type AIProvider interface {
	GenerateDiagram(ctx context.Context, req GenerateRequest) (*GenerateResponse, error)
	ModifyDiagram(ctx context.Context, req ModifyRequest) (*ModifyResponse, error)
	AnalyzeDiagram(ctx context.Context, req AnalyzeRequest) (*AnalyzeResponse, error)
	ExplainDiagram(ctx context.Context, req ExplainRequest) (*ExplainResponse, error)
}
