/**
 * @alignify/canvas-engine
 * High-performance, framework-agnostic 2D visual workspace engine.
 */

// Math
export * from './math/vec2';
export * from './math/mat2d';
export * from './math/bounds';
export * from './math/hit-test';
export * from './math/snap';

// Camera
export * from './camera/camera';

// Objects & Store
export * from './objects/object-factory';
export * from './objects/object-store';

// Selection
export * from './selection/selection-manager';

// History & Commands
export * from './history/command';
export * from './history/command-stack';
export * from './history/create-object.command';
export * from './history/delete-objects.command';
export * from './history/transform-objects.command';
export * from './history/update-properties.command';
export * from './history/reorder-objects.command';

// Tools
export * from './tools/tool';
export * from './tools/pan-tool';
export * from './tools/select-tool';
export * from './tools/shape-creation-tool';
export * from './tools/tool-manager';

// Rendering
export * from './renderer/grid-renderer';
export * from './renderer/shape-renderer';
export * from './renderer/selection-renderer';
export * from './renderer/presence-renderer';
export * from './renderer/canvas-renderer-2d';
export * from './renderer/presence-renderer';

// Clipboard & Export
export * from './clipboard/clipboard-manager';
export * from './export/export-manager';

// Storage & Persistence
export * from './storage/document-serializer';
export * from './storage/indexeddb-storage';

// Core
export * from './core/event-bus';
export * from './core/render-loop';
export * from './core/canvas-engine';
