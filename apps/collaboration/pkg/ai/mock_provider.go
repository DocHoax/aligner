package ai

import (
	"context"
	"fmt"
	"strings"
	"time"

	"alignify/collaboration/pkg/protocol"
)

// MockAIProvider provides rich, deterministic architecture generation, modification, and analysis.
type MockAIProvider struct {
	translator *DiagramTranslator
}

// NewMockAIProvider creates a new deterministic mock provider.
func NewMockAIProvider() *MockAIProvider {
	return &MockAIProvider{
		translator: NewDiagramTranslator(),
	}
}

// GenerateDiagram generates a structured architecture diagram from a prompt.
func (p *MockAIProvider) GenerateDiagram(ctx context.Context, req GenerateRequest) (*GenerateResponse, error) {
	promptLower := strings.ToLower(req.Prompt)

	var diagram ArchitectureDiagram

	switch {
	case strings.Contains(promptLower, "e-commerce") || strings.Contains(promptLower, "ecommerce") || strings.Contains(promptLower, "shop") || strings.Contains(promptLower, "store") || strings.Contains(promptLower, "cart"):
		diagram = p.buildECommerceDiagram()
	case strings.Contains(promptLower, "fintech") || strings.Contains(promptLower, "payment") || strings.Contains(promptLower, "bank") || strings.Contains(promptLower, "pci"):
		diagram = p.buildFintechDiagram()
	case strings.Contains(promptLower, "event") || strings.Contains(promptLower, "stream") || strings.Contains(promptLower, "kafka") || strings.Contains(promptLower, "analytics"):
		diagram = p.buildStreamingDiagram()
	case strings.Contains(promptLower, "3-tier") || strings.Contains(promptLower, "three-tier") || strings.Contains(promptLower, "saas") || strings.Contains(promptLower, "web app"):
		diagram = p.buildThreeTierDiagram()
	default: // E-Commerce / General Microservices
		diagram = p.buildECommerceDiagram()
	}

	direction := req.LayoutDirection
	if direction == "" {
		direction = "LR"
	}

	ops, err := p.translator.Translate(&diagram, direction)
	if err != nil {
		return nil, fmt.Errorf("failed to translate diagram: %w", err)
	}

	if err := ValidateOperations(ops); err != nil {
		return nil, fmt.Errorf("generated operations failed validation: %w", err)
	}

	return &GenerateResponse{
		Diagram:    diagram,
		Operations: ops,
		Summary:    diagram.Summary,
	}, nil
}

// ModifyDiagram incrementally updates an architecture diagram based on context and prompt.
func (p *MockAIProvider) ModifyDiagram(ctx context.Context, req ModifyRequest) (*ModifyResponse, error) {
	promptLower := strings.ToLower(req.Prompt)

	var addedNodes []ArchitectureNode
	var addedEdges []ArchitectureEdge
	var addedFrames []ArchitectureFrame
	var addedNodeIDs, modifiedNodeIDs, deletedNodeIDs []string

	baseX := 500.0
	baseY := 300.0

	summary := "Applied architectural modifications"

	switch {
	case strings.Contains(promptLower, "redis") || strings.Contains(promptLower, "cache"):
		cacheNode := ArchitectureNode{
			ID:        GenerateNewID("node_cache"),
			Type:      NodeCache,
			Label:     "Distributed Redis Cache",
			Subtitle:  "Cluster Mode (In-Memory)",
			TechStack: "Redis 7.2",
			X:         baseX + 180,
			Y:         baseY - 120,
			Width:     160,
			Height:    72,
		}
		addedNodes = append(addedNodes, cacheNode)
		addedNodeIDs = append(addedNodeIDs, cacheNode.ID)

		// Link to central service if existing
		edge := ArchitectureEdge{
			ID:       GenerateNewID("edge_cache"),
			FromID:   "srv_order",
			ToID:     cacheNode.ID,
			Label:    "Cache Read/Write",
			Protocol: ProtocolRedis,
			Style:    "dashed",
		}
		addedEdges = append(addedEdges, edge)
		summary = "Added high-performance Redis distributed cache cluster with sub-millisecond read latency"

	case strings.Contains(promptLower, "kafka") || strings.Contains(promptLower, "queue") || strings.Contains(promptLower, "broker"):
		queueNode := ArchitectureNode{
			ID:        GenerateNewID("node_queue"),
			Type:      NodeQueue,
			Label:     "Kafka Event Bus",
			Subtitle:  "Partitioned Topics",
			TechStack: "Apache Kafka 3.6",
			X:         baseX + 220,
			Y:         baseY + 160,
			Width:     170,
			Height:    72,
		}
		workerNode := ArchitectureNode{
			ID:        GenerateNewID("node_worker"),
			Type:      NodeWorker,
			Label:     "Event Processor Worker",
			Subtitle:  "Async Consumer Group",
			TechStack: "Go / Keda",
			X:         baseX + 460,
			Y:         baseY + 160,
			Width:     160,
			Height:    72,
		}
		addedNodes = append(addedNodes, queueNode, workerNode)
		addedNodeIDs = append(addedNodeIDs, queueNode.ID, workerNode.ID)

		edge1 := ArchitectureEdge{
			ID:       GenerateNewID("edge_pub"),
			FromID:   "srv_order",
			ToID:     queueNode.ID,
			Label:    "Publish Events",
			Protocol: ProtocolAsync,
		}
		edge2 := ArchitectureEdge{
			ID:       GenerateNewID("edge_sub"),
			FromID:   queueNode.ID,
			ToID:     workerNode.ID,
			Label:    "Consume Stream",
			Protocol: ProtocolAMQP,
		}
		addedEdges = append(addedEdges, edge1, edge2)
		summary = "Introduced asynchronous event-driven queue buffer with dedicated consumer worker group"

	case strings.Contains(promptLower, "load balancer") || strings.Contains(promptLower, "lb") || strings.Contains(promptLower, "ingress"):
		lbNode := ArchitectureNode{
			ID:        GenerateNewID("node_lb"),
			Type:      NodeLoadBalancer,
			Label:     "Network Load Balancer",
			Subtitle:  "HA Active-Passive",
			TechStack: "AWS NLB / Nginx",
			X:         100,
			Y:         baseY,
			Width:     160,
			Height:    72,
		}
		addedNodes = append(addedNodes, lbNode)
		addedNodeIDs = append(addedNodeIDs, lbNode.ID)
		summary = "Placed high-availability Load Balancer layer for traffic distribution and TLS termination"

	case strings.Contains(promptLower, "security") || strings.Contains(promptLower, "vpc") || strings.Contains(promptLower, "perimeter") || strings.Contains(promptLower, "dmz"):
		secFrame := ArchitectureFrame{
			ID:           GenerateNewID("frame_sec"),
			Label:        "PCI-DSS Zero-Trust Perimeter",
			Type:         FrameSecurityZone,
			ChildNodeIDs: []string{"srv_order", "srv_payment", "db_primary"},
			X:            baseX - 40,
			Y:            baseY - 60,
			Width:        520,
			Height:       380,
		}
		addedFrames = append(addedFrames, secFrame)
		summary = "Established strict isolated security perimeter with ingress filtering and mTLS enforcement"

	default:
		// General fallback addition
		newNode := ArchitectureNode{
			ID:        GenerateNewID("node_addon"),
			Type:      NodeMicroservice,
			Label:     "Notification Service",
			Subtitle:  "Multi-Channel Dispatch",
			TechStack: "Node.js / Twilio",
			X:         baseX + 240,
			Y:         baseY + 120,
			Width:     160,
			Height:    72,
		}
		addedNodes = append(addedNodes, newNode)
		addedNodeIDs = append(addedNodeIDs, newNode.ID)
		summary = fmt.Sprintf("Added %s subsystem with integration connections", newNode.Label)
	}

	modDiagram := ArchitectureDiagram{
		Nodes:   addedNodes,
		Edges:   addedEdges,
		Frames:  addedFrames,
		Summary: summary,
	}

	ops, err := p.translator.Translate(&modDiagram, "LR")
	if err != nil {
		return nil, fmt.Errorf("failed to translate modification: %w", err)
	}

	return &ModifyResponse{
		Diagram:         modDiagram,
		Operations:      ops,
		AddedNodeIDs:    addedNodeIDs,
		ModifiedNodeIDs: modifiedNodeIDs,
		DeletedNodeIDs:  deletedNodeIDs,
		Summary:         summary,
	}, nil
}

// AnalyzeDiagram evaluates architectural risk, SPOFs, performance bottlenecks, and security boundaries.
func (p *MockAIProvider) AnalyzeDiagram(ctx context.Context, req AnalyzeRequest) (*AnalyzeResponse, error) {
	// Inspect object list and construct diagnostic findings
	var findings []ArchitectureFinding

	// Rule 1: Single Point of Failure (SPOF) in persistence layer
	findings = append(findings, ArchitectureFinding{
		ID:          "finding_spof_db",
		RuleID:      "RULE_SPOF_PERSISTENCE",
		Title:       "Single Point of Failure: Unreplicated Database Node",
		Severity:    SeverityCritical,
		Category:    CategorySPOF,
		Description: "The primary transactional relational database lacks an automated failover replica or multi-AZ standby, leaving the system vulnerable to prolonged downtime during zone degradation.",
		Recommendation: "Deploy a synchronous Read Replica with automated DNS-based health checks and fast failover (e.g. AWS Aurora Multi-AZ or Patroni HA cluster).",
		AffectedNodeIDs: []string{"db_postgres", "db_primary", "node_database"},
		Position:        &protocol.Point{X: 780, Y: 220},
	})

	// Rule 2: Security & Zero-Trust Boundary
	findings = append(findings, ArchitectureFinding{
		ID:          "finding_sec_unauth_link",
		RuleID:      "RULE_SEC_PERIMETER",
		Title:       "Missing Ingress Authentication Gateway",
		Severity:    SeverityHigh,
		Category:    CategorySecurity,
		Description: "Core microservices and data stores are directly linked to public edge ingress without an intermediate API Gateway enforcing JWT/OAuth2 verification and rate limiting.",
		Recommendation: "Place an API Gateway or Ingress Controller enforcing token validation, TLS termination, and DDoS protection upstream.",
		AffectedNodeIDs: []string{"gw_ingress", "srv_product", "srv_order"},
		Position:        &protocol.Point{X: 320, Y: 180},
	})

	// Rule 3: Performance Bottleneck without Cache
	findings = append(findings, ArchitectureFinding{
		ID:          "finding_perf_high_io",
		RuleID:      "RULE_PERF_CACHE_ABSENT",
		Title:       "Unbuffered High-Frequency Database Read Path",
		Severity:    SeverityMedium,
		Category:    CategoryPerformance,
		Description: "High-throughput catalog and lookup services query the primary PostgreSQL database directly on every request without an in-memory caching tier.",
		Recommendation: "Introduce a Redis or Memcached cluster with Cache-Aside pattern (TTL 300s) to reduce database CPU load by 80-90%.",
		AffectedNodeIDs: []string{"srv_product", "db_postgres"},
		Position:        &protocol.Point{X: 520, Y: 220},
	})

	// Rule 4: Tight Coupling & Synchronous Cascades
	findings = append(findings, ArchitectureFinding{
		ID:          "finding_coupling_sync",
		RuleID:      "RULE_COUPLING_SYNC_CASCADE",
		Title:       "Synchronous Request-Reply Chaining (Distributed Monolith)",
		Severity:    SeverityLow,
		Category:    CategoryCoupling,
		Description: "Order creation invokes multiple downstream services synchronously over REST/HTTP, creating latency accumulation and cascading failure risk.",
		Recommendation: "Transition downstream tasks (notifications, analytics, payment processing) to asynchronous messaging with RabbitMQ or Kafka.",
		AffectedNodeIDs: []string{"srv_order", "srv_payment", "srv_notification"},
		Position:        &protocol.Point{X: 520, Y: 360},
	})

	// Rule 5: Scalability & Queue Backpressure
	findings = append(findings, ArchitectureFinding{
		ID:          "finding_scale_worker",
		RuleID:      "RULE_SCALE_STATIC_WORKER",
		Title:       "Static Worker Provisioning without Autoscaling",
		Severity:    SeverityInfo,
		Category:    CategoryScalability,
		Description: "Worker consumers do not declare Horizontal Pod Autoscaling (HPA) triggers on queue depth, risking buffer overflows during traffic spikes.",
		Recommendation: "Configure event-driven autoscaling based on queue lag metrics (e.g. KEDA / CloudWatch).",
		AffectedNodeIDs: []string{"worker_payment"},
		Position:        &protocol.Point{X: 780, Y: 360},
	})

	report := AnalysisReport{
		BoardID:       req.BoardID,
		OverallScore:  78.5,
		Summary:       "Architectural health score is 78.5/100. 1 Critical SPOF and 1 High-severity security perimeter issue detected.",
		Findings:      findings,
		CriticalCount: 1,
		HighCount:     1,
		MediumCount:   1,
		LowCount:      1,
		InfoCount:     1,
		AnalyzedAt:    time.Now().UTC(),
	}

	return &AnalyzeResponse{Report: report}, nil
}

// ExplainDiagram generates deep technical system documentation and data flow journeys.
func (p *MockAIProvider) ExplainDiagram(ctx context.Context, req ExplainRequest) (*ExplainResponse, error) {
	explanation := ArchitectureExplanation{
		Summary: "This system implements an enterprise Microservices Architecture with decoupled ingestion, transactional storage, distributed caching, and asynchronous event streams.",
		DataFlowJourney: []string{
			"1. Client Request Ingress: Incoming HTTPS traffic arrives at Cloudflare Edge CDN for DDoS mitigation and TLS termination.",
			"2. Ingress & Routing: The API Gateway inspects JWT auth tokens, enforces rate limits, and routes the request to the target domain service.",
			"3. Domain Processing: Order Service validates inventory and coordinates with Auth Service via high-speed internal gRPC.",
			"4. Persistence & Cache: Hot catalog data is served from Redis (<1ms); new order states are committed transactionally to PostgreSQL with ACID isolation.",
			"5. Asynchronous Event Dispatch: An `OrderCreated` event is published to RabbitMQ / Kafka, triggering asynchronous payment processing and email notifications.",
		},
		FailureModes: []string{
			"• Database Partition: If primary Postgres becomes unreachable, reads gracefully fall back to Redis cache while write requests are queued with circuit-breaker protection.",
			"• Payment Gateway Outage: Async workers retry failed transactions using exponential backoff with dead-letter queue (DLQ) containment.",
			"• Traffic Spikes (10x load): Stateless API services scale horizontally behind the Load Balancer via HPA; message queues buffer spike volume.",
		},
		ScalingCharacteristics: []string{
			"• Stateless Web/API Tier: Autoscales dynamically from 3 to 50 replicas based on CPU/Request throughput.",
			"• Caching Tier: Redis Cluster with read replicas scales read operations up to 100k+ QPS.",
			"• Database Tier: Read replicas offload analytical queries; primary node handles up to 5k write transactions per second.",
		},
		SecurityBoundaries: []string{
			"• DMZ Public Subnet: Only Edge CDN and Ingress Load Balancers have public IP addresses.",
			"• Application VPC: Microservices communicate over private subnets with mutual TLS (mTLS) and Istio service mesh policies.",
			"• Isolated Database Tier: Strict firewall rules allow database connections exclusively from authorized application security groups.",
		},
		FullText: `### System Architecture Deep-Dive

#### Overview
The architecture is partitioned into **Three Isolated Tiers** providing strong fault isolation, horizontal scalability, and zero-trust security.

1. **Ingress & Authentication Layer**: Cloudflare CDN & API Gateway terminate public traffic, validate OAuth2 Bearer tokens, and prevent malicious payload injection.
2. **Core Domain Services**: Microservices (Auth, Catalog, Orders, Payments) execute business logic in containerized Kubernetes pods with strict memory boundaries.
3. **Storage & Event Infrastructure**: ACID transactional persistence in PostgreSQL, sub-millisecond caching in Redis, and decoupled event handling via Kafka/RabbitMQ.`,
	}

	return &ExplainResponse{Explanation: explanation}, nil
}

// ==========================================
// Preset Architecture Builders
// ==========================================

func (p *MockAIProvider) buildECommerceDiagram() ArchitectureDiagram {
	nodes := []ArchitectureNode{
		{
			ID:        "gw_ingress",
			Type:      NodeGateway,
			Label:     "API Gateway",
			Subtitle:  "Auth & Rate Limiting",
			TechStack: "Envoy / Kong",
			Width:     160,
			Height:    72,
		},
		{
			ID:        "srv_auth",
			Type:      NodeAuth,
			Label:     "Auth Service",
			Subtitle:  "JWT & OAuth2 Tokens",
			TechStack: "Go / Ory Kratos",
			Width:     160,
			Height:    72,
		},
		{
			ID:        "srv_product",
			Type:      NodeMicroservice,
			Label:     "Product Catalog",
			Subtitle:  "Inventory & Search",
			TechStack: "Node.js / Express",
			Width:     160,
			Height:    72,
		},
		{
			ID:        "srv_order",
			Type:      NodeMicroservice,
			Label:     "Order Service",
			Subtitle:  "Cart & Checkout",
			TechStack: "Go / gRPC",
			Width:     160,
			Height:    72,
		},
		{
			ID:        "cache_redis",
			Type:      NodeCache,
			Label:     "Redis Cache",
			Subtitle:  "Catalog Cache (TTL 5m)",
			TechStack: "Redis 7.2 Cluster",
			Width:     160,
			Height:    72,
		},
		{
			ID:        "db_postgres",
			Type:      NodeDatabase,
			Label:     "PostgreSQL DB",
			Subtitle:  "Primary Transactional",
			TechStack: "Postgres 16 Multi-AZ",
			Width:     160,
			Height:    72,
		},
		{
			ID:        "queue_events",
			Type:      NodeQueue,
			Label:     "RabbitMQ Broker",
			Subtitle:  "Async Order Events",
			TechStack: "RabbitMQ 3.12",
			Width:     160,
			Height:    72,
		},
		{
			ID:        "worker_payment",
			Type:      NodeWorker,
			Label:     "Payment Worker",
			Subtitle:  "Stripe Checkout Dispatch",
			TechStack: "Go / Temporal",
			Width:     160,
			Height:    72,
		},
		{
			ID:        "ext_stripe",
			Type:      NodeExternalAPI,
			Label:     "Stripe API",
			Subtitle:  "Payment Gateway",
			TechStack: "External SaaS",
			Width:     160,
			Height:    72,
		},
	}

	edges := []ArchitectureEdge{
		{ID: "e_gw_auth", FromID: "gw_ingress", ToID: "srv_auth", Label: "Verify Token", Protocol: ProtocolGRPC},
		{ID: "e_gw_prod", FromID: "gw_ingress", ToID: "srv_product", Label: "Get Products", Protocol: ProtocolHTTPS},
		{ID: "e_gw_order", FromID: "gw_ingress", ToID: "srv_order", Label: "Submit Order", Protocol: ProtocolHTTPS},
		{ID: "e_prod_cache", FromID: "srv_product", ToID: "cache_redis", Label: "Query Cache", Protocol: ProtocolRedis},
		{ID: "e_order_db", FromID: "srv_order", ToID: "db_postgres", Label: "Write Order", Protocol: ProtocolSQL},
		{ID: "e_order_q", FromID: "srv_order", ToID: "queue_events", Label: "Publish Event", Protocol: ProtocolAMQP},
		{ID: "e_q_worker", FromID: "queue_events", ToID: "worker_payment", Label: "Consume Event", Protocol: ProtocolAMQP},
		{ID: "e_worker_stripe", FromID: "worker_payment", ToID: "ext_stripe", Label: "Process Charge", Protocol: ProtocolHTTPS},
	}

	frames := []ArchitectureFrame{
		{
			ID:           "frame_public",
			Label:        "Public Ingress Subnet",
			Type:         FrameSubnet,
			ChildNodeIDs: []string{"gw_ingress"},
		},
		{
			ID:           "frame_services",
			Label:        "Application VPC (Private)",
			Type:         FrameVPC,
			ChildNodeIDs: []string{"srv_auth", "srv_product", "srv_order", "worker_payment"},
		},
		{
			ID:           "frame_storage",
			Label:        "Data & Messaging Isolation Zone",
			Type:         FrameSecurityZone,
			ChildNodeIDs: []string{"cache_redis", "db_postgres", "queue_events"},
		},
	}

	return ArchitectureDiagram{
		Nodes:   nodes,
		Edges:   edges,
		Frames:  frames,
		Summary: "E-Commerce Microservices Architecture with API Gateway, Caching, Asynchronous Queueing, and Isolated DB Storage",
	}
}

func (p *MockAIProvider) buildFintechDiagram() ArchitectureDiagram {
	nodes := []ArchitectureNode{
		{
			ID:        "lb_edge",
			Type:      NodeLoadBalancer,
			Label:     "Edge Load Balancer",
			Subtitle:  "DDoS & TLS 1.3",
			TechStack: "AWS ALB / WAF",
			Width:     160,
			Height:    72,
		},
		{
			ID:        "srv_token",
			Type:      NodeAuth,
			Label:     "Tokenization Service",
			Subtitle:  "PCI-DSS Card Vault",
			TechStack: "Rust / KMS",
			Width:     160,
			Height:    72,
		},
		{
			ID:        "srv_ledger",
			Type:      NodeMicroservice,
			Label:     "Double-Entry Ledger",
			Subtitle:  "Immutable Accounting",
			TechStack: "Go / Raft",
			Width:     160,
			Height:    72,
		},
		{
			ID:        "queue_fraud",
			Type:      NodeQueue,
			Label:     "Fraud Detection Stream",
			Subtitle:  "Real-Time ML Scoring",
			TechStack: "Kafka Event Log",
			Width:     160,
			Height:    72,
		},
		{
			ID:        "db_ledger",
			Type:      NodeDatabase,
			Label:     "Ledger Database",
			Subtitle:  "Append-Only Financial Log",
			TechStack: "PostgreSQL with Citus",
			Width:     160,
			Height:    72,
		},
		{
			ID:        "srv_kms",
			Type:      NodeExternalAPI,
			Label:     "Hardware Security (HSM)",
			Subtitle:  "FIPS 140-2 Level 3",
			TechStack: "AWS CloudHSM",
			Width:     160,
			Height:    72,
		},
	}

	edges := []ArchitectureEdge{
		{ID: "e_lb_tok", FromID: "lb_edge", ToID: "srv_token", Label: "Tokenize Card", Protocol: ProtocolHTTPS},
		{ID: "e_tok_kms", FromID: "srv_token", ToID: "srv_kms", Label: "Encrypt Envelope", Protocol: ProtocolGRPC},
		{ID: "e_tok_ledger", FromID: "srv_token", ToID: "srv_ledger", Label: "Execute Transfer", Protocol: ProtocolGRPC},
		{ID: "e_ledger_fraud", FromID: "srv_ledger", ToID: "queue_fraud", Label: "Stream Transaction", Protocol: ProtocolAsync},
		{ID: "e_ledger_db", FromID: "srv_ledger", ToID: "db_ledger", Label: "ACID Commit", Protocol: ProtocolSQL},
	}

	frames := []ArchitectureFrame{
		{
			ID:           "frame_pci",
			Label:        "PCI-DSS Compliant Isolation Boundary",
			Type:         FrameTrustZone,
			ChildNodeIDs: []string{"srv_token", "srv_ledger", "db_ledger", "srv_kms"},
		},
	}

	return ArchitectureDiagram{
		Nodes:   nodes,
		Edges:   edges,
		Frames:  frames,
		Summary: "Fintech Payment & Ledger Platform with Tokenization Vault, HSM Encryption, and PCI-DSS Perimeter",
	}
}

func (p *MockAIProvider) buildStreamingDiagram() ArchitectureDiagram {
	nodes := []ArchitectureNode{
		{
			ID:        "gw_ingest",
			Type:      NodeGateway,
			Label:     "Telemetry Ingress",
			Subtitle:  "100k events/sec",
			TechStack: "Go / WebSocket / HTTP2",
			Width:     160,
			Height:    72,
		},
		{
			ID:        "kafka_b1",
			Type:      NodeEventBus,
			Label:     "Kafka Broker 1",
			Subtitle:  "Partition Leader 0, 1",
			TechStack: "Apache Kafka 3.6",
			Width:     150,
			Height:    72,
		},
		{
			ID:        "kafka_b2",
			Type:      NodeEventBus,
			Label:     "Kafka Broker 2",
			Subtitle:  "Partition Leader 2, 3",
			TechStack: "Apache Kafka 3.6",
			Width:     150,
			Height:    72,
		},
		{
			ID:        "worker_flink",
			Type:      NodeWorker,
			Label:     "Stream Processor",
			Subtitle:  "Tumbling Window 10s",
			TechStack: "Apache Flink",
			Width:     160,
			Height:    72,
		},
		{
			ID:        "db_clickhouse",
			Type:      NodeDatabase,
			Label:     "ClickHouse Columnar DB",
			Subtitle:  "Aggregated Metrics Log",
			TechStack: "ClickHouse OLAP",
			Width:     160,
			Height:    72,
		},
		{
			ID:        "cache_realtime",
			Type:      NodeCache,
			Label:     "Real-Time Leaderboard",
			Subtitle:  "Sorted Sets (ZSET)",
			TechStack: "Redis Cluster",
			Width:     160,
			Height:    72,
		},
	}

	edges := []ArchitectureEdge{
		{ID: "e_ingest_b1", FromID: "gw_ingest", ToID: "kafka_b1", Label: "Write Batch", Protocol: ProtocolTCP},
		{ID: "e_ingest_b2", FromID: "gw_ingest", ToID: "kafka_b2", Label: "Write Batch", Protocol: ProtocolTCP},
		{ID: "e_b1_flink", FromID: "kafka_b1", ToID: "worker_flink", Label: "Consume Stream", Protocol: ProtocolAsync},
		{ID: "e_b2_flink", FromID: "kafka_b2", ToID: "worker_flink", Label: "Consume Stream", Protocol: ProtocolAsync},
		{ID: "e_flink_ch", FromID: "worker_flink", ToID: "db_clickhouse", Label: "Bulk Insert", Protocol: ProtocolSQL},
		{ID: "e_flink_redis", FromID: "worker_flink", ToID: "cache_realtime", Label: "Update Stats", Protocol: ProtocolRedis},
	}

	frames := []ArchitectureFrame{
		{
			ID:           "frame_kafka",
			Label:        "Distributed Kafka Cluster (KRaft)",
			Type:         FrameK8sCluster,
			ChildNodeIDs: []string{"kafka_b1", "kafka_b2"},
		},
	}

	return ArchitectureDiagram{
		Nodes:   nodes,
		Edges:   edges,
		Frames:  frames,
		Summary: "Real-Time Event Streaming & Analytics Engine with Kafka, Flink Stream Processing, and ClickHouse OLAP Storage",
	}
}

func (p *MockAIProvider) buildThreeTierDiagram() ArchitectureDiagram {
	nodes := []ArchitectureNode{
		{
			ID:        "edge_cdn",
			Type:      NodeCDN,
			Label:     "Cloudflare CDN",
			Subtitle:  "Edge Caching & WAF",
			TechStack: "Cloudflare",
			Width:     160,
			Height:    72,
		},
		{
			ID:        "web_app",
			Type:      NodeMicroservice,
			Label:     "Frontend Static SPA",
			Subtitle:  "Single Page Application",
			TechStack: "Angular 19 / Nginx",
			Width:     160,
			Height:    72,
		},
		{
			ID:        "api_core",
			Type:      NodeMicroservice,
			Label:     "Core Backend API",
			Subtitle:  "REST & WebSockets",
			TechStack: "Go / Gorilla Mux",
			Width:     160,
			Height:    72,
		},
		{
			ID:        "db_primary",
			Type:      NodeDatabase,
			Label:     "PostgreSQL Primary",
			Subtitle:  "Read/Write Master",
			TechStack: "Postgres 16",
			Width:     160,
			Height:    72,
		},
		{
			ID:        "db_replica",
			Type:      NodeDatabase,
			Label:     "PostgreSQL Read Replica",
			Subtitle:  "Streaming Replication",
			TechStack: "Postgres 16 (Read-Only)",
			Width:     160,
			Height:    72,
		},
	}

	edges := []ArchitectureEdge{
		{ID: "e_cdn_web", FromID: "edge_cdn", ToID: "web_app", Label: "Serve Static Assets", Protocol: ProtocolHTTPS},
		{ID: "e_web_api", FromID: "web_app", ToID: "api_core", Label: "API Requests", Protocol: ProtocolHTTPS},
		{ID: "e_api_primary", FromID: "api_core", ToID: "db_primary", Label: "Write Transactions", Protocol: ProtocolSQL},
		{ID: "e_api_replica", FromID: "api_core", ToID: "db_replica", Label: "Read Queries", Protocol: ProtocolSQL},
		{ID: "e_prim_rep", FromID: "db_primary", ToID: "db_replica", Label: "WAL Replication", Protocol: ProtocolCDC, Style: "dashed"},
	}

	frames := []ArchitectureFrame{
		{
			ID:           "frame_db_cluster",
			Label:        "High-Availability Database Cluster",
			Type:         FrameServiceGroup,
			ChildNodeIDs: []string{"db_primary", "db_replica"},
		},
	}

	return ArchitectureDiagram{
		Nodes:   nodes,
		Edges:   edges,
		Frames:  frames,
		Summary: "Classic 3-Tier Web Architecture with Cloudflare CDN, Angular SPA, Go Backend, and Primary-Replica PostgreSQL",
	}
}
