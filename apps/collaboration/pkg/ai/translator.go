package ai

import (
	"fmt"
	"math"
	"sort"
	"time"

	"alignify/collaboration/pkg/protocol"
	"alignify/collaboration/pkg/utils"
)

// NodeTypeTheme defines color schemes for different architecture components.
type NodeTypeTheme struct {
	FillColor   string
	StrokeColor string
	TextColor   string
	Icon        string
}

var defaultThemes = map[ArchitectureNodeType]NodeTypeTheme{
	NodeGateway: {
		FillColor:   "#1e1b4b", // Deep Indigo
		StrokeColor: "#6366f1", // Indigo 500
		TextColor:   "#e0e7ff",
		Icon:        "globe",
	},
	NodeMicroservice: {
		FillColor:   "#0f172a", // Slate 900
		StrokeColor: "#3b82f6", // Blue 500
		TextColor:   "#f8fafc",
		Icon:        "server",
	},
	NodeDatabase: {
		FillColor:   "#064e3b", // Deep Emerald
		StrokeColor: "#10b981", // Emerald 500
		TextColor:   "#d1fae5",
		Icon:        "database",
	},
	NodeCache: {
		FillColor:   "#4c1d95", // Deep Purple
		StrokeColor: "#a855f7", // Purple 500
		TextColor:   "#f3e8ff",
		Icon:        "zap",
	},
	NodeQueue: {
		FillColor:   "#78350f", // Deep Amber
		StrokeColor: "#f59e0b", // Amber 500
		TextColor:   "#fef3c7",
		Icon:        "inbox",
	},
	NodeCDN: {
		FillColor:   "#1e293b", // Slate 800
		StrokeColor: "#06b6d4", // Cyan 500
		TextColor:   "#cffafe",
		Icon:        "cloud",
	},
	NodeAuth: {
		FillColor:   "#4c0519", // Deep Rose
		StrokeColor: "#f43f5e", // Rose 500
		TextColor:   "#ffe4e6",
		Icon:        "shield",
	},
	NodeStorage: {
		FillColor:   "#14532d", // Deep Green
		StrokeColor: "#22c55e", // Green 500
		TextColor:   "#dcfce7",
		Icon:        "folder",
	},
	NodeWorker: {
		FillColor:   "#1e293b", // Slate 800
		StrokeColor: "#eab308", // Yellow 500
		TextColor:   "#fef9c3",
		Icon:        "cpu",
	},
	NodeExternalAPI: {
		FillColor:   "#18181b", // Zinc 900
		StrokeColor: "#71717a", // Zinc 500
		TextColor:   "#f4f4f5",
		Icon:        "external-link",
	},
	NodeLoadBalancer: {
		FillColor:   "#1e1b4b", // Deep Indigo
		StrokeColor: "#818cf8", // Indigo 400
		TextColor:   "#e0e7ff",
		Icon:        "git-merge",
	},
	NodeEventBus: {
		FillColor:   "#701a75", // Deep Fuchsia
		StrokeColor: "#d946ef", // Fuchsia 500
		TextColor:   "#fae8ff",
		Icon:        "activity",
	},
}

var defaultFrameThemes = map[ArchitectureFrameType]NodeTypeTheme{
	FrameVPC: {
		FillColor:   "rgba(30, 41, 59, 0.15)", // Translucent Slate
		StrokeColor: "#475569",                // Slate 600
		TextColor:   "#94a3b8",
	},
	FrameSubnet: {
		FillColor:   "rgba(15, 23, 42, 0.2)",
		StrokeColor: "#334155",
		TextColor:   "#64748b",
	},
	FrameTrustZone: {
		FillColor:   "rgba(76, 5, 25, 0.12)",
		StrokeColor: "#e11d48",
		TextColor:   "#fda4af",
	},
	FrameRegion: {
		FillColor:   "rgba(30, 27, 75, 0.15)",
		StrokeColor: "#6366f1",
		TextColor:   "#a5b4fc",
	},
	FrameK8sCluster: {
		FillColor:   "rgba(14, 116, 144, 0.12)",
		StrokeColor: "#06b6d4",
		TextColor:   "#67e8f9",
	},
	FrameSecurityZone: {
		FillColor:   "rgba(153, 27, 27, 0.15)",
		StrokeColor: "#ef4444",
		TextColor:   "#fca5a5",
	},
	FrameServiceGroup: {
		FillColor:   "rgba(30, 41, 59, 0.15)",
		StrokeColor: "#3b82f6",
		TextColor:   "#93c5fd",
	},
}

// DiagramTranslator converts structured ArchitectureDiagram models to Alignify DocumentOperations.
type DiagramTranslator struct{}

// NewDiagramTranslator creates a new translator instance.
func NewDiagramTranslator() *DiagramTranslator {
	return &DiagramTranslator{}
}

// Translate converts an ArchitectureDiagram into Canvas Objects and CreateObject operations.
func (t *DiagramTranslator) Translate(diagram *ArchitectureDiagram, direction string) ([]protocol.DocumentOperation, error) {
	if diagram == nil {
		return nil, fmt.Errorf("diagram cannot be nil")
	}

	// 1. Auto-layout node positions if unassigned or clustered
	t.applyAutoLayout(diagram, direction)

	var ops []protocol.DocumentOperation
	now := time.Now().UnixMilli()
	zIndexCounter := 10

	// 2. Translate Frames (lowest z-indices so they sit beneath nodes)
	for i := range diagram.Frames {
		frame := &diagram.Frames[i]
		theme, ok := defaultFrameThemes[frame.Type]
		if !ok {
			theme = defaultFrameThemes[FrameVPC]
		}

		fillColor := frame.FillColor
		if fillColor == "" {
			fillColor = theme.FillColor
		}
		strokeColor := frame.StrokeColor
		if strokeColor == "" {
			strokeColor = theme.StrokeColor
		}
		strokeStyle := frame.StrokeStyle
		if strokeStyle == "" {
			strokeStyle = "dashed"
		}

		frameObj := map[string]interface{}{
			"id":          frame.ID,
			"type":        "frame",
			"name":        frame.Label,
			"x":           frame.X,
			"y":           frame.Y,
			"width":       frame.Width,
			"height":      frame.Height,
			"fillColor":   fillColor,
			"strokeColor": strokeColor,
			"strokeWidth": 2.0,
			"strokeStyle": strokeStyle,
			"cornerRadius": 12.0,
			"rotation":    0.0,
			"zIndex":      zIndexCounter,
			"locked":      false,
			"opacity":     1.0,
			"createdAt":   now,
			"updatedAt":   now,
			"metadata": map[string]interface{}{
				"frameType":    string(frame.Type),
				"childNodeIds": frame.ChildNodeIDs,
			},
		}
		zIndexCounter += 5

		ops = append(ops, protocol.DocumentOperation{
			Op:     "create",
			Object: frameObj,
		})
	}

	// 3. Translate Nodes (Shape + Label + TechStack text)
	nodeMap := make(map[string]*ArchitectureNode)
	for i := range diagram.Nodes {
		node := &diagram.Nodes[i]
		nodeMap[node.ID] = node

		theme, ok := defaultThemes[node.Type]
		if !ok {
			theme = defaultThemes[NodeMicroservice]
		}

		fillColor := node.FillColor
		if fillColor == "" {
			fillColor = theme.FillColor
		}
		strokeColor := node.StrokeColor
		if strokeColor == "" {
			strokeColor = theme.StrokeColor
		}
		textColor := node.TextColor
		if textColor == "" {
			textColor = theme.TextColor
		}

		// Node Shape (Rectangle or Ellipse for DB)
		shapeType := "rectangle"
		cornerRadius := 8.0
		if node.Type == NodeGateway || node.Type == NodeCDN || node.Type == NodeLoadBalancer {
			cornerRadius = 14.0
		}

		shapeObj := map[string]interface{}{
			"id":          node.ID,
			"type":        shapeType,
			"x":           node.X,
			"y":           node.Y,
			"width":       node.Width,
			"height":      node.Height,
			"fillColor":   fillColor,
			"strokeColor": strokeColor,
			"strokeWidth": 2.0,
			"strokeStyle": "solid",
			"cornerRadius": cornerRadius,
			"rotation":    0.0,
			"zIndex":      zIndexCounter,
			"locked":      false,
			"opacity":     1.0,
			"createdAt":   now,
			"updatedAt":   now,
			"metadata": map[string]interface{}{
				"nodeType":  string(node.Type),
				"label":     node.Label,
				"techStack": node.TechStack,
				"subtitle":  node.Subtitle,
				"icon":      theme.Icon,
			},
		}
		zIndexCounter += 2

		ops = append(ops, protocol.DocumentOperation{
			Op:     "create",
			Object: shapeObj,
		})

		// Node Primary Title Text
		labelID := fmt.Sprintf("%s_lbl", node.ID)
		labelTextObj := map[string]interface{}{
			"id":         labelID,
			"type":       "text",
			"text":       node.Label,
			"x":          node.X + 8.0,
			"y":          node.Y + (node.Height/2.0 - 16.0),
			"width":      node.Width - 16.0,
			"height":     24.0,
			"fontSize":   13.0,
			"fontWeight": 600,
			"fontFamily": "Inter, sans-serif",
			"textAlign":  "center",
			"textColor":  textColor,
			"rotation":   0.0,
			"zIndex":     zIndexCounter,
			"locked":     false,
			"opacity":    1.0,
			"createdAt":  now,
			"updatedAt":  now,
		}
		zIndexCounter += 2

		ops = append(ops, protocol.DocumentOperation{
			Op:     "create",
			Object: labelTextObj,
		})

		// Node Secondary Subtitle / Tech Stack Badge
		subtitleText := node.Subtitle
		if subtitleText == "" && node.TechStack != "" {
			subtitleText = node.TechStack
		}
		if subtitleText != "" {
			subID := fmt.Sprintf("%s_sub", node.ID)
			subTextObj := map[string]interface{}{
				"id":         subID,
				"type":       "text",
				"text":       subtitleText,
				"x":          node.X + 8.0,
				"y":          node.Y + (node.Height/2.0 + 4.0),
				"width":      node.Width - 16.0,
				"height":     18.0,
				"fontSize":   10.0,
				"fontWeight": 400,
				"fontFamily": "Inter, sans-serif",
				"textAlign":  "center",
				"textColor":  "#94a3b8",
				"rotation":   0.0,
				"zIndex":     zIndexCounter,
				"locked":     false,
				"opacity":    1.0,
				"createdAt":  now,
				"updatedAt":  now,
			}
			zIndexCounter += 2

			ops = append(ops, protocol.DocumentOperation{
				Op:     "create",
				Object: subTextObj,
			})
		}
	}

	// 4. Translate Edges (Arrows with midpoint labels)
	for _, edge := range diagram.Edges {
		fromNode, okFrom := nodeMap[edge.FromID]
		toNode, okTo := nodeMap[edge.ToID]
		if !okFrom || !okTo {
			continue
		}

		// Calculate clean anchor points between nodes
		startX, startY, endX, endY := calculateEdgeAnchors(fromNode, toNode)

		strokeColor := edge.Color
		if strokeColor == "" {
			strokeColor = "#94a3b8" // Slate 400
		}
		strokeStyle := edge.Style
		if strokeStyle == "" {
			strokeStyle = "solid"
		}
		startHead := "none"
		if edge.Direction == "bidirectional" {
			startHead = "arrow"
		}

		arrowObj := map[string]interface{}{
			"id":          edge.ID,
			"type":        "arrow",
			"x":           startX,
			"y":           startY,
			"x2":          endX,
			"y2":          endY,
			"width":       math.Abs(endX - startX),
			"height":      math.Abs(endY - startY),
			"strokeColor": strokeColor,
			"strokeWidth": 2.0,
			"strokeStyle": strokeStyle,
			"startHead":   startHead,
			"endHead":     "arrow",
			"rotation":    0.0,
			"zIndex":      zIndexCounter,
			"locked":      false,
			"opacity":     1.0,
			"createdAt":   now,
			"updatedAt":   now,
			"metadata": map[string]interface{}{
				"protocol": string(edge.Protocol),
				"fromId":   edge.FromID,
				"toId":     edge.ToID,
			},
		}
		zIndexCounter += 2

		ops = append(ops, protocol.DocumentOperation{
			Op:     "create",
			Object: arrowObj,
		})

		// Edge Label Annotation
		edgeLabel := edge.Label
		if edgeLabel == "" && edge.Protocol != "" {
			edgeLabel = string(edge.Protocol)
		}
		if edgeLabel != "" {
			midX := (startX + endX) / 2.0
			midY := (startY + endY) / 2.0

			edgeLblID := fmt.Sprintf("%s_lbl", edge.ID)
			edgeLblObj := map[string]interface{}{
				"id":         edgeLblID,
				"type":       "text",
				"text":       edgeLabel,
				"x":          midX - 40.0,
				"y":          midY - 10.0,
				"width":      80.0,
				"height":     20.0,
				"fontSize":   10.0,
				"fontWeight": 500,
				"fontFamily": "Inter, sans-serif",
				"textAlign":  "center",
				"textColor":  "#cbd5e1",
				"rotation":   0.0,
				"zIndex":     zIndexCounter,
				"locked":     false,
				"opacity":    1.0,
				"createdAt":  now,
				"updatedAt":  now,
			}
			zIndexCounter += 2

			ops = append(ops, protocol.DocumentOperation{
				Op:     "create",
				Object: edgeLblObj,
			})
		}
	}

	return ops, nil
}

// calculateEdgeAnchors computes geometric perimeter intersection points between source and target boxes.
func calculateEdgeAnchors(from, to *ArchitectureNode) (float64, float64, float64, float64) {
	fromCenter := protocol.Point{X: from.X + from.Width/2.0, Y: from.Y + from.Height/2.0}
	toCenter := protocol.Point{X: to.X + to.Width/2.0, Y: to.Y + to.Height/2.0}

	dx := toCenter.X - fromCenter.X
	dy := toCenter.Y - fromCenter.Y

	var startX, startY, endX, endY float64

	if math.Abs(dx) >= math.Abs(dy) {
		// Dominant horizontal direction
		if dx > 0 {
			startX = from.X + from.Width
			startY = fromCenter.Y
			endX = to.X
			endY = toCenter.Y
		} else {
			startX = from.X
			startY = fromCenter.Y
			endX = to.X + to.Width
			endY = toCenter.Y
		}
	} else {
		// Dominant vertical direction
		if dy > 0 {
			startX = fromCenter.X
			startY = from.Y + from.Height
			endX = toCenter.X
			endY = to.Y
		} else {
			startX = fromCenter.X
			startY = from.Y
			endX = toCenter.X
			endY = to.Y + to.Height
		}
	}

	return startX, startY, endX, endY
}

// applyAutoLayout arranges diagram nodes in a layered hierarchical structure if coordinates are unspecified.
func (t *DiagramTranslator) applyAutoLayout(diagram *ArchitectureDiagram, direction string) {
	if len(diagram.Nodes) == 0 {
		return
	}

	// Check if nodes already have custom non-overlapping layouts
	hasPositions := true
	for _, n := range diagram.Nodes {
		if n.X == 0 && n.Y == 0 {
			hasPositions = false
			break
		}
	}
	if hasPositions {
		return
	}

	// 1. Build adjacency graph & in-degrees
	nodeIndex := make(map[string]int)
	for i, n := range diagram.Nodes {
		nodeIndex[n.ID] = i
		if diagram.Nodes[i].Width <= 0 {
			diagram.Nodes[i].Width = 160.0
		}
		if diagram.Nodes[i].Height <= 0 {
			diagram.Nodes[i].Height = 72.0
		}
	}

	inDegree := make(map[string]int)
	adjList := make(map[string][]string)
	for _, e := range diagram.Edges {
		adjList[e.FromID] = append(adjList[e.FromID], e.ToID)
		inDegree[e.ToID]++
	}

	// 2. Layer assignment (Longest path / Topological ranking)
	ranks := make(map[string]int)
	var queue []string

	for _, n := range diagram.Nodes {
		if inDegree[n.ID] == 0 {
			ranks[n.ID] = 0
			queue = append(queue, n.ID)
		}
	}

	// If cyclic or all in-degree > 0, fallback rank 0 for unvisited
	for _, n := range diagram.Nodes {
		if _, ok := ranks[n.ID]; !ok {
			ranks[n.ID] = 0
			queue = append(queue, n.ID)
		}
	}

	for len(queue) > 0 {
		curr := queue[0]
		queue = queue[1:]
		currRank := ranks[curr]

		for _, neighbor := range adjList[curr] {
			if ranks[neighbor] < currRank+1 {
				ranks[neighbor] = currRank + 1
				queue = append(queue, neighbor)
			}
		}
	}

	// 3. Group nodes by rank
	rankBuckets := make(map[int][]string)
	maxRank := 0
	for _, n := range diagram.Nodes {
		r := ranks[n.ID]
		rankBuckets[r] = append(rankBuckets[r], n.ID)
		if r > maxRank {
			maxRank = r
		}
	}

	// Sort nodes inside ranks for consistent order
	for r := range rankBuckets {
		sort.Slice(rankBuckets[r], func(i, j int) bool {
			return rankBuckets[r][i] < rankBuckets[r][j]
		})
	}

	// 4. Compute Spatial Coordinates
	baseX := 120.0
	baseY := 120.0
	gapX := 100.0
	gapY := 60.0
	nodeWidth := 160.0
	nodeHeight := 72.0

	isTB := direction == "TB"

	for r := 0; r <= maxRank; r++ {
		nodesInRank := rankBuckets[r]
		count := len(nodesInRank)

		for idx, nodeID := range nodesInRank {
			i := nodeIndex[nodeID]
			if isTB {
				// Top to Bottom: Rank is Y, Index is X
				diagram.Nodes[i].X = baseX + float64(idx)*(nodeWidth+gapX)
				diagram.Nodes[i].Y = baseY + float64(r)*(nodeHeight+gapY*1.6)
			} else {
				// Left to Right (default): Rank is X, Index is Y
				totalRankHeight := float64(count)*nodeHeight + float64(count-1)*gapY
				offsetY := -totalRankHeight / 2.0
				diagram.Nodes[i].X = baseX + float64(r)*(nodeWidth+gapX*1.6)
				diagram.Nodes[i].Y = baseY + float64(idx)*(nodeHeight+gapY) + offsetY + 200.0
			}
		}
	}

	// 5. Compute Frame bounds enclosing child nodes
	nodePosMap := make(map[string]*ArchitectureNode)
	for i := range diagram.Nodes {
		nodePosMap[diagram.Nodes[i].ID] = &diagram.Nodes[i]
	}

	framePadding := 40.0
	for i := range diagram.Frames {
		f := &diagram.Frames[i]
		if len(f.ChildNodeIDs) == 0 {
			continue
		}

		minX := math.MaxFloat64
		minY := math.MaxFloat64
		maxX := -math.MaxFloat64
		maxY := -math.MaxFloat64

		foundChildren := 0
		for _, childID := range f.ChildNodeIDs {
			if childNode, ok := nodePosMap[childID]; ok {
				foundChildren++
				if childNode.X < minX {
					minX = childNode.X
				}
				if childNode.Y < minY {
					minY = childNode.Y
				}
				if childNode.X+childNode.Width > maxX {
					maxX = childNode.X + childNode.Width
				}
				if childNode.Y+childNode.Height > maxY {
					maxY = childNode.Y + childNode.Height
				}
			}
		}

		if foundChildren > 0 {
			f.X = minX - framePadding
			f.Y = minY - framePadding - 20.0 // extra top margin for header label
			f.Width = (maxX - minX) + framePadding*2.0
			f.Height = (maxY - minY) + framePadding*2.0 + 20.0
		}
	}
}

// GenerateNewID generates a consistent canvas object ID.
func GenerateNewID(prefix string) string {
	return utils.GenerateID(prefix)
}
