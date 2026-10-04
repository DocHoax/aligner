import { describe, it, expect } from 'vitest';
import { DocumentSerializer } from '../storage/document-serializer';
import { ObjectFactory } from '../objects/object-factory';

describe('Document Serializer', () => {
  it('serializes and deserializes canvas document schema version 1', () => {
    const meta = {
      id: 'test-doc-1',
      name: 'System Architecture',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      version: 1,
      objectCount: 2
    };

    const rect = ObjectFactory.createRectangle({ id: 'r1', x: 100, y: 100 });
    const text = ObjectFactory.createText({ id: 't1', text: 'Auth Service' });
    const camera = { x: 50, y: -20, zoom: 1.25 };

    const serialized = DocumentSerializer.serialize(meta, [rect, text], camera);

    expect(serialized.version).toBe(1);
    expect(serialized.id).toBe('test-doc-1');
    expect(serialized.objects.length).toBe(2);
    expect(serialized.camera.zoom).toBe(1.25);

    const jsonString = JSON.stringify(serialized);
    const deserialized = DocumentSerializer.deserialize(jsonString);

    expect(deserialized.meta.id).toBe('test-doc-1');
    expect(deserialized.meta.name).toBe('System Architecture');
    expect(deserialized.objects.length).toBe(2);
    expect(deserialized.objects[0]?.id).toBe('r1');
    expect(deserialized.objects[1]?.id).toBe('t1');
    expect(deserialized.camera.zoom).toBe(1.25);
  });
});
