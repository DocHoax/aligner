import {
  BoardDocument,
  CURRENT_DOCUMENT_VERSION,
  CanvasObjectType
} from './index';

export { CURRENT_DOCUMENT_VERSION };

export interface DocumentValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface DocumentValidationResult {
  readonly valid: boolean;
  readonly issues: readonly DocumentValidationIssue[];
}

const canvasObjectTypes: readonly CanvasObjectType[] = [
  'rectangle',
  'ellipse',
  'text',
  'sticky',
  'line',
  'arrow',
  'frame',
  'group'
];

export function validateBoardDocument(value: unknown): DocumentValidationResult {
  const issues: DocumentValidationIssue[] = [];

  if (!isRecord(value)) {
    return {
      valid: false,
      issues: [{ path: '', message: 'Document must be an object.' }]
    };
  }

  if (value.version !== CURRENT_DOCUMENT_VERSION) {
    issues.push({
      path: 'version',
      message: `Document version must be ${CURRENT_DOCUMENT_VERSION}.`
    });
  }

  requireString(value, 'id', issues);
  requireString(value, 'name', issues);
  requireFiniteNumber(value, 'createdAt', issues);
  requireFiniteNumber(value, 'updatedAt', issues);

  if (!isRecord(value.camera)) {
    issues.push({ path: 'camera', message: 'Camera must be an object.' });
  } else {
    requireFiniteNumber(value.camera, 'x', issues, 'camera');
    requireFiniteNumber(value.camera, 'y', issues, 'camera');
    requirePositiveNumber(value.camera, 'zoom', issues, 'camera');
  }

  if (!Array.isArray(value.objects)) {
    issues.push({ path: 'objects', message: 'Objects must be an array.' });
  } else {
    validateObjects(value.objects, issues);
  }

  if (!isRecord(value.metadata)) {
    issues.push({ path: 'metadata', message: 'Metadata must be an object.' });
  }

  return { valid: issues.length === 0, issues };
}

export function isValidBoardDocument(value: unknown): value is BoardDocument {
  return validateBoardDocument(value).valid;
}

function validateObjects(objects: readonly unknown[], issues: DocumentValidationIssue[]): void {
  const ids = new Set<string>();

  objects.forEach((value, index) => {
    const path = `objects[${index}]`;
    if (!isRecord(value)) {
      issues.push({ path, message: 'Object must be an object.' });
      return;
    }

    if (typeof value.id !== 'string' || value.id.length === 0) {
      issues.push({ path: `${path}.id`, message: 'Object ID must be a non-empty string.' });
    } else if (ids.has(value.id)) {
      issues.push({ path: `${path}.id`, message: `Duplicate object ID "${value.id}".` });
    } else {
      ids.add(value.id);
    }

    if (typeof value.type !== 'string' || !canvasObjectTypes.includes(value.type as CanvasObjectType)) {
      issues.push({ path: `${path}.type`, message: 'Object type is not supported.' });
    }

    for (const field of ['x', 'y', 'width', 'height', 'rotation', 'zIndex', 'opacity', 'createdAt', 'updatedAt']) {
      requireFiniteNumber(value, field, issues, path);
    }

    if (typeof value.width === 'number' && value.width < 0) {
      issues.push({ path: `${path}.width`, message: 'Width cannot be negative.' });
    }
    if (typeof value.height === 'number' && value.height < 0) {
      issues.push({ path: `${path}.height`, message: 'Height cannot be negative.' });
    }
    if (typeof value.opacity === 'number' && (value.opacity < 0 || value.opacity > 1)) {
      issues.push({ path: `${path}.opacity`, message: 'Opacity must be between 0 and 1.' });
    }

    if (value.type === 'line' || value.type === 'arrow') {
      requireFiniteNumber(value, 'x2', issues, path);
      requireFiniteNumber(value, 'y2', issues, path);
    }
  });
}

function requireString(
  record: Record<string, unknown>,
  field: string,
  issues: DocumentValidationIssue[],
  prefix = ''
): void {
  if (typeof record[field] !== 'string' || record[field].length === 0) {
    issues.push({
      path: prefix ? `${prefix}.${field}` : field,
      message: `${field} must be a non-empty string.`
    });
  }
}

function requireFiniteNumber(
  record: Record<string, unknown>,
  field: string,
  issues: DocumentValidationIssue[],
  prefix = ''
): void {
  if (typeof record[field] !== 'number' || !Number.isFinite(record[field])) {
    issues.push({
      path: prefix ? `${prefix}.${field}` : field,
      message: `${field} must be a finite number.`
    });
  }
}

function requirePositiveNumber(
  record: Record<string, unknown>,
  field: string,
  issues: DocumentValidationIssue[],
  prefix = ''
): void {
  requireFiniteNumber(record, field, issues, prefix);
  if (typeof record[field] === 'number' && record[field] <= 0) {
    issues.push({
      path: prefix ? `${prefix}.${field}` : field,
      message: `${field} must be greater than zero.`
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
