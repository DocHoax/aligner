package ai

import (
	"fmt"
	"regexp"
	"strings"

	"alignify/collaboration/pkg/utils"
)

// MermaidEngine handles bidirectional conversion between Alignify Canvas Objects and Mermaid Flowcharts.
type MermaidEngine struct {
	translator *DiagramTranslator
}

// NewMermaidEngine creates a new Mermaid engine instance.
func NewMermaidEngine() *MermaidEngine {
	return &MermaidEngine{
		translator: NewDiagramTranslator(),
	}
}

// ExportToMermaid serializes canvas objects into a clean Mermaid flowchart representation.
func (m *MermaidEngine) ExportToMermaid(objects []map[string]interface{}, direction string) (string, error) {
	if direction == "" {
		direction = "LR"
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("flowchart %s\n", direction))

	// Categorize objects
	frames := make([]map[string]interface{}, 0)
	nodes := make(map[string]map[string]interface{})
	arrows := make([]map[string]interface{}, 0)
	textLabels := make(map[string]string)

	for _, obj := range objects {
		id, _ := obj["id"].(string)
		objType, _ := obj["type"].(string)

		switch objType {
		case "frame":
			frames = append(frames, obj)
		case "arrow", "line":
			arrows = append(arrows, obj)
		case "text":
			text, _ := obj["text"].(string)
			textLabels[id] = text
		default:
			// Shapes (rectangle, ellipse, etc.)
			nodes[id] = obj
		}
	}

	// 1. Process Frames / Subgraphs
	assignedToSubgraph := make(map[string]bool)

	for _, frame := range frames {
		frameID, _ := frame["id"].(string)
		frameName, _ := frame["name"].(string)
		if frameName == "" {
			frameName = "Subsystem Boundary"
		}

		cleanFrameID := sanitizeMermaidID(frameID)
		sb.WriteString(fmt.Sprintf("\n    subgraph %s [\"%s\"]\n", cleanFrameID, escapeMermaidText(frameName)))

		// Find enclosed nodes
		frameX, _ := getFloat(frame["x"])
		frameY, _ := getFloat(frame["y"])
		frameW, _ := getFloat(frame["width"])
		frameH, _ := getFloat(frame["height"])

		for nodeID, node := range nodes {
			nx, _ := getFloat(node["x"])
			ny, _ := getFloat(node["y"])
			nw, _ := getFloat(node["width"])
			nh, _ := getFloat(node["height"])

			// Check containment
			if nx >= frameX && ny >= frameY && (nx+nw) <= (frameX+frameW) && (ny+nh) <= (frameY+frameH) {
				nodeLabel := getNodeLabel(nodeID, node, textLabels)
				cleanNodeID := sanitizeMermaidID(nodeID)
				sb.WriteString(fmt.Sprintf("        %s[\"%s\"]\n", cleanNodeID, escapeMermaidText(nodeLabel)))
				assignedToSubgraph[nodeID] = true
			}
		}

		sb.WriteString("    end\n")
	}

	// 2. Process Remaining Standalone Nodes
	sb.WriteString("\n")
	for nodeID, node := range nodes {
		if !assignedToSubgraph[nodeID] {
			nodeLabel := getNodeLabel(nodeID, node, textLabels)
			cleanNodeID := sanitizeMermaidID(nodeID)
			sb.WriteString(fmt.Sprintf("    %s[\"%s\"]\n", cleanNodeID, escapeMermaidText(nodeLabel)))
		}
	}

	// 3. Process Edges / Arrows
	sb.WriteString("\n")
	for _, arrow := range arrows {
		meta, _ := arrow["metadata"].(map[string]interface{})
		var fromID, toID, edgeLabel string

		if meta != nil {
			fromID, _ = meta["fromId"].(string)
			toID, _ = meta["toId"].(string)
			edgeLabel, _ = meta["protocol"].(string)
		}

		if fromID == "" || toID == "" {
			// Find nearest nodes to start/end points
			ax, _ := getFloat(arrow["x"])
			ay, _ := getFloat(arrow["y"])
			ax2, _ := getFloat(arrow["x2"])
			ay2, _ := getFloat(arrow["y2"])

			fromID = findNearestNodeID(ax, ay, nodes)
			toID = findNearestNodeID(ax2, ay2, nodes)
		}

		if fromID != "" && toID != "" && fromID != toID {
			cleanFrom := sanitizeMermaidID(fromID)
			cleanTo := sanitizeMermaidID(toID)

			if edgeLabel != "" {
				sb.WriteString(fmt.Sprintf("    %s -->|\"%s\"| %s\n", cleanFrom, escapeMermaidText(edgeLabel), cleanTo))
			} else {
				sb.WriteString(fmt.Sprintf("    %s --> %s\n", cleanFrom, cleanTo))
			}
		}
	}

	return sb.String(), nil
}

// ImportFromMermaid parses a Mermaid flowchart and generates native Canvas DocumentOperations.
func (m *MermaidEngine) ImportFromMermaid(mermaidText string) (*GenerateResponse, error) {
	lines := strings.Split(mermaidText, "\n")
	if len(lines) == 0 {
		return nil, fmt.Errorf("empty mermaid diagram text")
	}

	direction := "LR"
	var nodes []ArchitectureNode
	var edges []ArchitectureEdge
	var frames []ArchitectureFrame

	nodeMap := make(map[string]*ArchitectureNode)
	var currentFrame *ArchitectureFrame

	// Regex patterns for Mermaid flowchart parsing
	reHeader := regexp.MustCompile(`(?i)^\s*(?:flowchart|graph)\s+(TD|TB|LR|RL|BT)`)
	reSubgraph := regexp.MustCompile(`(?i)^\s*subgraph\s+([A-Za-z0-9_]+)(?:\s*\["([^"]+)"\])?`)
	reEnd := regexp.MustCompile(`(?i)^\s*end\s*$`)
	reEdgeWithLabel := regexp.MustCompile(`(?i)^\s*([A-Za-z0-9_]+)\s*(-->|-.->|==>)\s*\|"([^"]+)"\|\s*([A-Za-z0-9_]+)`)
	reEdgeSimple := regexp.MustCompile(`(?i)^\s*([A-Za-z0-9_]+)\s*(-->|-.->|==>)\s*([A-Za-z0-9_]+)`)
	reNodeWithLabel := regexp.MustCompile(`(?i)^\s*([A-Za-z0-9_]+)\s*(\[|\(\[|\{\{|\(\()(?:"([^"]+)"|([^"\]\)\}\)]+))(\]|\)\]|\}\}|\)\))`)

	for _, rawLine := range lines {
		line := strings.TrimSpace(rawLine)
		if line == "" || strings.HasPrefix(line, "%%") {
			continue
		}

		// 1. Check Header
		if match := reHeader.FindStringSubmatch(line); len(match) > 1 {
			dir := strings.ToUpper(match[1])
			if dir == "TB" || dir == "TD" {
				direction = "TB"
			} else {
				direction = "LR"
			}
			continue
		}

		// 2. Check Subgraph Start
		if match := reSubgraph.FindStringSubmatch(line); len(match) > 1 {
			frameID := utils.GenerateID("frame_" + match[1])
			frameLabel := match[1]
			if len(match) > 2 && match[2] != "" {
				frameLabel = match[2]
			}

			frame := ArchitectureFrame{
				ID:           frameID,
				Label:        frameLabel,
				Type:         FrameVPC,
				ChildNodeIDs: make([]string, 0),
			}
			frames = append(frames, frame)
			currentFrame = &frames[len(frames)-1]
			continue
		}

		// 3. Check Subgraph End
		if reEnd.MatchString(line) {
			currentFrame = nil
			continue
		}

		// 4. Check Labeled Edge (e.g. A -->|"HTTPS"| B)
		if match := reEdgeWithLabel.FindStringSubmatch(line); len(match) > 4 {
			fromRaw := match[1]
			arrowStyle := match[2]
			edgeLabel := match[3]
			toRaw := match[4]

			fromNode := ensureNodeExists(fromRaw, fromRaw, &nodes, nodeMap, currentFrame)
			toNode := ensureNodeExists(toRaw, toRaw, &nodes, nodeMap, currentFrame)

			style := "solid"
			if strings.Contains(arrowStyle, "-.-") {
				style = "dashed"
			}

			edge := ArchitectureEdge{
				ID:        utils.GenerateID("edge"),
				FromID:    fromNode.ID,
				ToID:      toNode.ID,
				Label:     edgeLabel,
				Protocol:  inferProtocol(edgeLabel),
				Direction: "unidirectional",
				Style:     style,
			}
			edges = append(edges, edge)
			continue
		}

		// 5. Check Simple Edge (e.g. A --> B)
		if match := reEdgeSimple.FindStringSubmatch(line); len(match) > 3 {
			fromRaw := match[1]
			arrowStyle := match[2]
			toRaw := match[3]

			fromNode := ensureNodeExists(fromRaw, fromRaw, &nodes, nodeMap, currentFrame)
			toNode := ensureNodeExists(toRaw, toRaw, &nodes, nodeMap, currentFrame)

			style := "solid"
			if strings.Contains(arrowStyle, "-.-") {
				style = "dashed"
			}

			edge := ArchitectureEdge{
				ID:        utils.GenerateID("edge"),
				FromID:    fromNode.ID,
				ToID:      toNode.ID,
				Direction: "unidirectional",
				Style:     style,
			}
			edges = append(edges, edge)
			continue
		}

		// 6. Check Explicit Node Declaration (e.g. A["API Gateway"])
		if match := reNodeWithLabel.FindStringSubmatch(line); len(match) > 3 {
			nodeIDRaw := match[1]
			nodeLabel := match[3]
			if nodeLabel == "" && len(match) > 4 {
				nodeLabel = match[4]
			}
			if nodeLabel == "" {
				nodeLabel = nodeIDRaw
			}

			ensureNodeExists(nodeIDRaw, nodeLabel, &nodes, nodeMap, currentFrame)
			continue
		}
	}

	diagram := ArchitectureDiagram{
		Nodes:   nodes,
		Edges:   edges,
		Frames:  frames,
		Summary: fmt.Sprintf("Imported %d components and %d connections from Mermaid flowchart", len(nodes), len(edges)),
	}

	ops, err := m.translator.Translate(&diagram, direction)
	if err != nil {
		return nil, fmt.Errorf("failed to translate mermaid graph: %w", err)
	}

	if err := ValidateOperations(ops); err != nil {
		return nil, fmt.Errorf("validated operations error: %w", err)
	}

	return &GenerateResponse{
		Diagram:    diagram,
		Operations: ops,
		Summary:    diagram.Summary,
	}, nil
}

func ensureNodeExists(rawID, label string, nodes *[]ArchitectureNode, nodeMap map[string]*ArchitectureNode, currentFrame *ArchitectureFrame) *ArchitectureNode {
	cleanID := strings.TrimSpace(rawID)
	if existing, ok := nodeMap[cleanID]; ok {
		if label != "" && existing.Label == cleanID {
			existing.Label = label
			existing.Type = inferNodeType(label)
		}
		return existing
	}

	nodeID := utils.GenerateID("node_" + cleanID)
	nodeType := inferNodeType(label)

	node := ArchitectureNode{
		ID:        nodeID,
		Type:      nodeType,
		Label:     label,
		Width:     160,
		Height:    72,
		TechStack: string(nodeType),
	}

	*nodes = append(*nodes, node)
	nodeMap[cleanID] = &(*nodes)[len(*nodes)-1]

	if currentFrame != nil {
		currentFrame.ChildNodeIDs = append(currentFrame.ChildNodeIDs, nodeID)
	}

	return nodeMap[cleanID]
}

func inferNodeType(label string) ArchitectureNodeType {
	lower := strings.ToLower(label)
	switch {
	case strings.Contains(lower, "gateway") || strings.Contains(lower, "ingress") || strings.Contains(lower, "router"):
		return NodeGateway
	case strings.Contains(lower, "db") || strings.Contains(lower, "postgres") || strings.Contains(lower, "mysql") || strings.Contains(lower, "mongo") || strings.Contains(lower, "database") || strings.Contains(lower, "storage"):
		return NodeDatabase
	case strings.Contains(lower, "cache") || strings.Contains(lower, "redis") || strings.Contains(lower, "memcached"):
		return NodeCache
	case strings.Contains(lower, "queue") || strings.Contains(lower, "kafka") || strings.Contains(lower, "rabbit") || strings.Contains(lower, "amqp") || strings.Contains(lower, "bus") || strings.Contains(lower, "sqs"):
		return NodeQueue
	case strings.Contains(lower, "auth") || strings.Contains(lower, "login") || strings.Contains(lower, "identity") || strings.Contains(lower, "jwt"):
		return NodeAuth
	case strings.Contains(lower, "worker") || strings.Contains(lower, "job") || strings.Contains(lower, "consumer") || strings.Contains(lower, "processor"):
		return NodeWorker
	case strings.Contains(lower, "cdn") || strings.Contains(lower, "edge") || strings.Contains(lower, "cloudflare"):
		return NodeCDN
	case strings.Contains(lower, "lb") || strings.Contains(lower, "balancer"):
		return NodeLoadBalancer
	case strings.Contains(lower, "api") && (strings.Contains(lower, "external") || strings.Contains(lower, "stripe") || strings.Contains(lower, "aws")):
		return NodeExternalAPI
	default:
		return NodeMicroservice
	}
}

func inferProtocol(label string) ArchitectureEdgeProtocol {
	lower := strings.ToLower(label)
	switch {
	case strings.Contains(lower, "grpc"):
		return ProtocolGRPC
	case strings.Contains(lower, "http") || strings.Contains(lower, "rest"):
		return ProtocolHTTPS
	case strings.Contains(lower, "sql") || strings.Contains(lower, "query"):
		return ProtocolSQL
	case strings.Contains(lower, "redis"):
		return ProtocolRedis
	case strings.Contains(lower, "kafka") || strings.Contains(lower, "queue") || strings.Contains(lower, "amqp"):
		return ProtocolAMQP
	case strings.Contains(lower, "async") || strings.Contains(lower, "event"):
		return ProtocolAsync
	case strings.Contains(lower, "ws") || strings.Contains(lower, "websocket"):
		return ProtocolWS
	default:
		return ProtocolHTTPS
	}
}

func getNodeLabel(nodeID string, node map[string]interface{}, textLabels map[string]string) string {
	meta, _ := node["metadata"].(map[string]interface{})
	if meta != nil {
		if lbl, ok := meta["label"].(string); ok && lbl != "" {
			return lbl
		}
	}

	labelID := fmt.Sprintf("%s_lbl", nodeID)
	if txt, ok := textLabels[labelID]; ok && txt != "" {
		return txt
	}

	name, _ := node["name"].(string)
	if name != "" {
		return name
	}

	return nodeID
}

func findNearestNodeID(x, y float64, nodes map[string]map[string]interface{}) string {
	var nearestID string
	minDist := 1000000.0

	for id, node := range nodes {
		nx, _ := getFloat(node["x"])
		ny, _ := getFloat(node["y"])
		nw, _ := getFloat(node["width"])
		nh, _ := getFloat(node["height"])

		cx := nx + nw/2.0
		cy := ny + nh/2.0

		dx := cx - x
		dy := cy - y
		dist := dx*dx + dy*dy

		if dist < minDist {
			minDist = dist
			nearestID = id
		}
	}

	return nearestID
}

func sanitizeMermaidID(id string) string {
	reg := regexp.MustCompile(`[^a-zA-Z0-9_]`)
	cleaned := reg.ReplaceAllString(id, "_")
	if len(cleaned) > 0 && (cleaned[0] >= '0' && cleaned[0] <= '9') {
		cleaned = "n_" + cleaned
	}
	return cleaned
}

func escapeMermaidText(text string) string {
	text = strings.ReplaceAll(text, "\"", "'")
	text = strings.ReplaceAll(text, "\n", " ")
	return text
}
