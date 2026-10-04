/**
 * Document Serializer
 * Schema versioning, serialization, deserialization, and validation of Alignify canvas documents.
 */
import {
  CameraState,
  CanvasDocument,
  CanvasObject,
  DocumentMeta
} from '@alignify/shared-types';

export const CURRENT_DOCUMENT_SCHEMA_VERSION = 1;

export class DocumentSerializer {
  static serialize(
    meta: DocumentMeta,
    objects: CanvasObject[],
    camera: CameraState
  ): CanvasDocument {
    return {
      version: CURRENT_DOCUMENT_SCHEMA_VERSION,
      id: meta.id,
      name: meta.name,
      createdAt: meta.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      camera: {
        x: camera.x,
        y: camera.y,
        zoom: camera.zoom
      },
      objects: JSON.parse(JSON.stringify(objects))
    };
  }

  static deserialize(data: string | Record<string, unknown>): {
    meta: DocumentMeta;
    objects: CanvasObject[];
    camera: CameraState;
  } {
    let parsed: Record<string, unknown>;
    if (typeof data === 'string') {
      try {
        parsed = JSON.parse(data);
      } catch (err) {
        throw new Error(`[DocumentSerializer] Invalid JSON format: ${(err as Error).message}`);
      }
    } else {
      parsed = data;
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('[DocumentSerializer] Parsed document is not an object');
    }

    const version = (parsed['version'] as number) || 1;
    const migrated = this.migrate(parsed, version);

    const meta: DocumentMeta = {
      id: (migrated['id'] as string) || 'doc_' + Date.now().toString(36),
      name: (migrated['name'] as string) || 'Untitled Diagram',
      createdAt: (migrated['createdAt'] as string) || new Date().toISOString(),
      updatedAt: (migrated['updatedAt'] as string) || new Date().toISOString(),
      version: CURRENT_DOCUMENT_SCHEMA_VERSION,
      objectCount: Array.isArray(migrated['objects']) ? migrated['objects'].length : 0
    };

    const objects: CanvasObject[] = Array.isArray(migrated['objects'])
      ? (migrated['objects'] as CanvasObject[])
      : [];

    const cameraObj = (migrated['camera'] as Record<string, number>) || {};
    const camera: CameraState = {
      x: typeof cameraObj['x'] === 'number' ? cameraObj['x'] : 0,
      y: typeof cameraObj['y'] === 'number' ? cameraObj['y'] : 0,
      zoom: typeof cameraObj['zoom'] === 'number' ? cameraObj['zoom'] : 1
    };

    return { meta, objects, camera };
  }

  private static migrate(raw: Record<string, unknown>, version: number): Record<string, unknown> {
    const doc = { ...raw };
    if (version < 1) {
      doc['version'] = 1;
    }
    // Future schema migrations can be added cleanly here
    return doc;
  }
}
