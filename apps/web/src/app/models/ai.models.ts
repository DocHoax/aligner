import { DocumentOperation, Point } from '@alignify/protocol';

export type ArchitectureNodeType =
  | 'gateway'
  | 'microservice'
  | 'database'
  | 'cache'
  | 'queue'
  | 'cdn'
  | 'auth'
  | 'storage'
  | 'worker'
  | 'external_api'
  | 'load_balancer'
  | 'event_bus';

export interface ArchitectureNode {
  id: string;
  type: ArchitectureNodeType;
  label: string;
  subtitle?: string;
  techStack?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor?: string;
  strokeColor?: string;
  textColor?: string;
  icon?: string;
  metadata?: Record<string, unknown>;
}

export type ArchitectureEdgeProtocol =
  | 'https'
  | 'grpc'
  | 'amqp'
  | 'sql'
  | 'redis'
  | 'async'
  | 'cdc'
  | 'tcp'
  | 'websocket';

export interface ArchitectureEdge {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
  protocol?: ArchitectureEdgeProtocol;
  direction?: 'unidirectional' | 'bidirectional';
  style?: 'solid' | 'dashed' | 'dotted';
  color?: string;
}

export type ArchitectureFrameType =
  | 'vpc'
  | 'subnet'
  | 'trust_boundary'
  | 'region'
  | 'kubernetes_cluster'
  | 'security_zone'
  | 'service_group';

export interface ArchitectureFrame {
  id: string;
  label: string;
  type: ArchitectureFrameType;
  childNodeIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor?: string;
  strokeColor?: string;
  strokeStyle?: string;
}

export interface ArchitectureDiagram {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  frames: ArchitectureFrame[];
  summary?: string;
}

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type FindingCategory =
  | 'spof'
  | 'security'
  | 'performance'
  | 'coupling'
  | 'reliability'
  | 'scalability';

export interface ArchitectureFinding {
  id: string;
  ruleId: string;
  title: string;
  severity: FindingSeverity;
  category: FindingCategory;
  description: string;
  recommendation: string;
  affectedNodeIds: string[];
  affectedEdgeIds: string[];
  position?: Point;
}

export interface AnalysisReport {
  boardId: string;
  overallScore: number;
  summary: string;
  findings: ArchitectureFinding[];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  analyzedAt: string;
}

export interface ArchitectureExplanation {
  summary: string;
  dataFlowJourney: string[];
  failureModes: string[];
  scalingCharacteristics: string[];
  securityBoundaries: string[];
  fullText: string;
}

// Request & Response DTOs
export interface GenerateRequest {
  boardId?: string;
  prompt: string;
  layoutDirection?: 'LR' | 'TB';
  stylePreset?: string;
}

export interface GenerateResponse {
  diagram: ArchitectureDiagram;
  operations: DocumentOperation[];
  summary: string;
}

export interface ModifyRequest {
  boardId?: string;
  prompt: string;
  existingObjects?: Array<Record<string, unknown>>;
  selectedIds?: string[];
}

export interface ModifyResponse {
  diagram: ArchitectureDiagram;
  operations: DocumentOperation[];
  addedNodeIds: string[];
  modifiedNodeIds: string[];
  deletedNodeIds: string[];
  summary: string;
}

export interface AnalyzeRequest {
  boardId?: string;
  objects?: Array<Record<string, unknown>>;
}

export interface AnalyzeResponse {
  report: AnalysisReport;
}

export interface ExplainRequest {
  boardId?: string;
  objects?: Array<Record<string, unknown>>;
  question?: string;
}

export interface ExplainResponse {
  explanation: ArchitectureExplanation;
}

export interface MermaidExportRequest {
  objects?: Array<Record<string, unknown>>;
  direction?: string;
}

export interface MermaidExportResponse {
  mermaid: string;
}

export interface MermaidImportRequest {
  mermaid: string;
}

export interface MermaidImportResponse {
  diagram: ArchitectureDiagram;
  operations: DocumentOperation[];
}
