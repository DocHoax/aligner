package ai

import (
	"errors"
	"fmt"
	"math"

	"alignify/collaboration/pkg/protocol"
)

const (
	// MaxAIOperations is the maximum number of operations allowed in a single AI payload.
	MaxAIOperations = 200

	// MinCanvasCoordinate defines bounds to avoid infinite coordinate corruption.
	MinCanvasCoordinate = -100000.0
	MaxCanvasCoordinate = 100000.0
)

var (
	ErrTooManyOperations    = fmt.Errorf("operation count exceeds safety cap of %d", MaxAIOperations)
	ErrInvalidOperation     = errors.New("invalid operation structure")
	ErrInvalidCoordinates   = errors.New("object coordinates out of safety bounds")
	ErrInvalidDimensions    = errors.New("object dimensions must be strictly positive")
	ErrUnknownObjectType    = errors.New("unsupported canvas object type")
	ErrDanglingEdgeReference = errors.New("edge references non-existent node ID")
)

var allowedObjectTypes = map[string]bool{
	"rectangle": true,
	"ellipse":   true,
	"text":      true,
	"sticky":    true,
	"line":      true,
	"arrow":     true,
	"frame":     true,
	"group":     true,
}

// ValidateOperations checks a slice of DocumentOperations against safety policies.
func ValidateOperations(ops []protocol.DocumentOperation) error {
	totalOps := countOperations(ops)
	if totalOps > MaxAIOperations {
		return fmt.Errorf("%w: received %d operations", ErrTooManyOperations, totalOps)
	}

	for _, op := range ops {
		if err := validateSingleOperation(op); err != nil {
			return err
		}
	}

	return nil
}

func countOperations(ops []protocol.DocumentOperation) int {
	count := 0
	for _, op := range ops {
		if op.Op == "batch" && len(op.Operations) > 0 {
			count += countOperations(op.Operations)
		} else {
			count++
		}
	}
	return count
}

func validateSingleOperation(op protocol.DocumentOperation) error {
	switch op.Op {
	case "create":
		if op.Object == nil {
			return fmt.Errorf("%w: create operation missing object payload", ErrInvalidOperation)
		}
		return validateCanvasObjectMap(op.Object)

	case "delete":
		if op.ID == "" {
			return fmt.Errorf("%w: delete operation missing target id", ErrInvalidOperation)
		}

	case "move":
		if op.ID == "" {
			return fmt.Errorf("%w: move operation missing target id", ErrInvalidOperation)
		}
		if !isValidNumber(op.X) || !isValidNumber(op.Y) {
			return ErrInvalidCoordinates
		}

	case "resize":
		if op.ID == "" {
			return fmt.Errorf("%w: resize operation missing target id", ErrInvalidOperation)
		}
		if !isValidNumber(op.X) || !isValidNumber(op.Y) {
			return ErrInvalidCoordinates
		}
		if op.Width <= 0 || op.Height <= 0 || !isValidNumber(op.Width) || !isValidNumber(op.Height) {
			return ErrInvalidDimensions
		}

	case "rotate":
		if op.ID == "" {
			return fmt.Errorf("%w: rotate operation missing target id", ErrInvalidOperation)
		}
		if !isValidNumber(op.Rotation) {
			return ErrInvalidCoordinates
		}

	case "update":
		if op.ID == "" {
			return fmt.Errorf("%w: update operation missing target id", ErrInvalidOperation)
		}
		if op.Changes == nil {
			return fmt.Errorf("%w: update operation missing changes payload", ErrInvalidOperation)
		}

	case "group":
		if op.GroupID == "" || len(op.ChildIDs) == 0 {
			return fmt.Errorf("%w: group operation missing groupId or childIds", ErrInvalidOperation)
		}

	case "ungroup":
		if op.GroupID == "" {
			return fmt.Errorf("%w: ungroup operation missing groupId", ErrInvalidOperation)
		}

	case "batch":
		for _, child := range op.Operations {
			if err := validateSingleOperation(child); err != nil {
				return err
			}
		}

	default:
		return fmt.Errorf("%w: unknown operation type %q", ErrInvalidOperation, op.Op)
	}

	return nil
}

func validateCanvasObjectMap(obj map[string]interface{}) error {
	id, _ := obj["id"].(string)
	if id == "" {
		return fmt.Errorf("%w: object missing id", ErrInvalidOperation)
	}

	objType, _ := obj["type"].(string)
	if !allowedObjectTypes[objType] {
		return fmt.Errorf("%w: %q", ErrUnknownObjectType, objType)
	}

	x, okX := getFloat(obj["x"])
	y, okY := getFloat(obj["y"])
	w, okW := getFloat(obj["width"])
	h, okH := getFloat(obj["height"])

	if !okX || !okY || !isValidNumber(x) || !isValidNumber(y) {
		return ErrInvalidCoordinates
	}

	// Line and arrow endpoints use x2, y2 instead of width/height constraints
	if objType == "line" || objType == "arrow" {
		x2, okX2 := getFloat(obj["x2"])
		y2, okY2 := getFloat(obj["y2"])
		if !okX2 || !okY2 || !isValidNumber(x2) || !isValidNumber(y2) {
			return fmt.Errorf("%w: line/arrow endpoints invalid", ErrInvalidCoordinates)
		}
	} else {
		if !okW || !okH || w <= 0 || h <= 0 || !isValidNumber(w) || !isValidNumber(h) {
			return ErrInvalidDimensions
		}
	}

	return nil
}

func isValidNumber(n float64) bool {
	if math.IsNaN(n) || math.IsInf(n, 0) {
		return false
	}
	return n >= MinCanvasCoordinate && n <= MaxCanvasCoordinate
}

func getFloat(val interface{}) (float64, bool) {
	switch v := val.(type) {
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	default:
		return 0, false
	}
}

// ValidateDiagramStructuralIntegrity verifies that graph topology has no dangling edges or orphans.
func ValidateDiagramStructuralIntegrity(diagram *ArchitectureDiagram) error {
	nodeIDs := make(map[string]bool)
	for _, n := range diagram.Nodes {
		if n.ID == "" {
			return errors.New("diagram node missing id")
		}
		nodeIDs[n.ID] = true
	}

	for _, e := range diagram.Edges {
		if !nodeIDs[e.FromID] {
			return fmt.Errorf("%w: edge %s source %s not in diagram nodes", ErrDanglingEdgeReference, e.ID, e.FromID)
		}
		if !nodeIDs[e.ToID] {
			return fmt.Errorf("%w: edge %s target %s not in diagram nodes", ErrDanglingEdgeReference, e.ID, e.ToID)
		}
	}

	return nil
}
