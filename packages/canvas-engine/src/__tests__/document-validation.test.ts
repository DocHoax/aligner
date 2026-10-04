import { describe, expect, it } from 'vitest';
import {
  CURRENT_DOCUMENT_VERSION,
  validateBoardDocument
} from '../../../shared-types/src/document-validation';

const validDocument = {
  version: CURRENT_DOCUMENT_VERSION,
  id: 'board-1',
  name: 'Architecture',
  createdAt: 1,
  updatedAt: 2,
  camera: { x: 0, y: 0, zoom: 1 },
  objects: [
    {
      id: 'rectangle-1',
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      rotation: 0,
      zIndex: 0,
      locked: false,
      opacity: 1,
      createdAt: 1,
      updatedAt: 1
    }
  ],
  metadata: {}
};

describe('validateBoardDocument', () => {
  it('accepts a valid board document', () => {
    expect(validateBoardDocument(validDocument)).toEqual({
      valid: true,
      issues: []
    });
  });

  it('reports duplicate IDs and invalid geometry', () => {
    const invalid = {
      ...validDocument,
      objects: [
        validDocument.objects[0],
        { ...validDocument.objects[0], x: Number.NaN, width: -1 }
      ]
    };

    const result = validateBoardDocument(invalid);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'objects[1].id' }),
        expect.objectContaining({ path: 'objects[1].x' }),
        expect.objectContaining({ path: 'objects[1].width' })
      ])
    );
  });

  it('rejects unsupported document versions', () => {
    const result = validateBoardDocument({
      ...validDocument,
      version: CURRENT_DOCUMENT_VERSION + 1
    });

    expect(result.valid).toBe(false);
    expect(result.issues[0]).toEqual({
      path: 'version',
      message: `Document version must be ${CURRENT_DOCUMENT_VERSION}.`
    });
  });
});
