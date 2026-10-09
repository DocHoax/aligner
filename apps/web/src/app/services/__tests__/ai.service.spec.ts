import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { signal } from '@angular/core';
import { AiService } from '../ai.service';
import {
  GenerateRequest,
  GenerateResponse,
  ModifyRequest,
  ModifyResponse,
  AnalyzeResponse,
  ExplainResponse,
  MermaidExportResponse,
  MermaidImportRequest,
  MermaidImportResponse
} from '../../models/ai.models';

describe('AiService', () => {
  let aiService: AiService;
  let mockHttpClient: any;
  let mockAuthService: any;

  beforeEach(() => {
    mockHttpClient = {
      get: vi.fn(),
      post: vi.fn()
    };

    mockAuthService = {
      getAuthHeaders: vi.fn().mockReturnValue({ Authorization: 'Bearer test_token' })
    };

    aiService = Object.create(AiService.prototype);
    (aiService as any).http = mockHttpClient;
    (aiService as any).authService = mockAuthService;

    // Initialize signals
    (aiService as any).generating = signal<boolean>(false);
    (aiService as any).modifying = signal<boolean>(false);
    (aiService as any).analyzing = signal<boolean>(false);
    (aiService as any).explaining = signal<boolean>(false);
    (aiService as any).exportingMermaid = signal<boolean>(false);
    (aiService as any).importingMermaid = signal<boolean>(false);

    (aiService as any).lastReport = signal(null);
    (aiService as any).lastExplanation = signal(null);
    (aiService as any).lastGeneratedDiagram = signal(null);
    (aiService as any).lastMermaidCode = signal(null);
    (aiService as any).error = signal(null);
  });

  describe('generateDiagram', () => {
    it('should post generate request with auth headers and update lastGeneratedDiagram', () => {
      const mockResponse: GenerateResponse = {
        diagram: {
          nodes: [
            { id: 'node_1', type: 'gateway', label: 'API Gateway', x: 100, y: 100, width: 140, height: 70 }
          ],
          edges: [],
          frames: []
        },
        operations: [],
        summary: 'Generated API Gateway'
      };

      mockHttpClient.post.mockReturnValue(of(mockResponse));

      const req: GenerateRequest = {
        prompt: 'Build a serverless payment system',
        layoutDirection: 'LR',
        stylePreset: 'modern-dark'
      };

      let result: GenerateResponse | undefined;
      aiService.generateDiagram('brd_123', req).subscribe((res) => {
        result = res;
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/boards/brd_123/ai/generate',
        req,
        { headers: { Authorization: 'Bearer test_token' } }
      );
      expect(result).toEqual(mockResponse);
      expect(aiService.lastGeneratedDiagram()).toEqual(mockResponse.diagram);
      expect(aiService.generating()).toBe(false);
    });

    it('should set error signal on generate failure', () => {
      mockHttpClient.post.mockReturnValue(
        throwError(() => ({ error: { error: 'LLM Rate limit reached' } }))
      );

      aiService.generateDiagram('brd_123', { prompt: 'Test' }).subscribe({
        error: (err) => {
          expect(err).toBeDefined();
        }
      });

      expect(aiService.error()).toBe('LLM Rate limit reached');
      expect(aiService.generating()).toBe(false);
    });
  });

  describe('modifyDiagram', () => {
    it('should post modify request and store diagram result', () => {
      const mockResponse: ModifyResponse = {
        diagram: {
          nodes: [
            { id: 'node_1', type: 'cache', label: 'Redis Cache', x: 200, y: 200, width: 120, height: 60 }
          ],
          edges: [],
          frames: []
        },
        operations: [],
        addedNodeIds: ['node_1'],
        modifiedNodeIds: [],
        deletedNodeIds: [],
        summary: 'Added Redis cache layer'
      };

      mockHttpClient.post.mockReturnValue(of(mockResponse));

      const req: ModifyRequest = {
        prompt: 'Add a Redis cache before database',
        selectedIds: ['node_db']
      };

      let result: ModifyResponse | undefined;
      aiService.modifyDiagram('brd_123', req).subscribe((res) => {
        result = res;
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/boards/brd_123/ai/modify',
        req,
        { headers: { Authorization: 'Bearer test_token' } }
      );
      expect(result).toEqual(mockResponse);
      expect(aiService.lastGeneratedDiagram()).toEqual(mockResponse.diagram);
      expect(aiService.modifying()).toBe(false);
    });
  });

  describe('analyzeDiagram', () => {
    it('should post analyze request and update lastReport signal', () => {
      const mockResponse: AnalyzeResponse = {
        report: {
          boardId: 'brd_123',
          overallScore: 82,
          summary: 'Good security posture with 1 single point of failure',
          findings: [
            {
              id: 'find_1',
              ruleId: 'spof_gateway',
              title: 'Single Point of Failure at API Gateway',
              severity: 'high',
              category: 'spof',
              description: 'Gateway has no redundant replica or load balancer.',
              recommendation: 'Deploy redundant gateway nodes behind an ALB.',
              affectedNodeIds: ['gw_1'],
              affectedEdgeIds: []
            }
          ],
          criticalCount: 0,
          highCount: 1,
          mediumCount: 0,
          lowCount: 0,
          infoCount: 0,
          analyzedAt: '2026-10-09T10:00:00Z'
        }
      };

      mockHttpClient.post.mockReturnValue(of(mockResponse));

      let result: AnalyzeResponse | undefined;
      aiService.analyzeDiagram('brd_123').subscribe((res) => {
        result = res;
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/boards/brd_123/ai/analyze',
        {},
        { headers: { Authorization: 'Bearer test_token' } }
      );
      expect(result).toEqual(mockResponse);
      expect(aiService.lastReport()).toEqual(mockResponse.report);
      expect(aiService.analyzing()).toBe(false);
    });
  });

  describe('explainDiagram', () => {
    it('should post explain request and update lastExplanation signal', () => {
      const mockResponse: ExplainResponse = {
        explanation: {
          summary: 'Event-driven microservices architecture',
          dataFlowJourney: ['User request hits Cloudflare CDN', 'Forwarded to API Gateway'],
          failureModes: ['Kafka broker failure causes queue backlog'],
          scalingCharacteristics: ['Horizontal auto-scaling for workers'],
          securityBoundaries: ['Private VPC for microservices'],
          fullText: 'Detailed technical explanation...'
        }
      };

      mockHttpClient.post.mockReturnValue(of(mockResponse));

      let result: ExplainResponse | undefined;
      aiService.explainDiagram('brd_123', { question: 'What happens on payment fail?' }).subscribe((res) => {
        result = res;
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/boards/brd_123/ai/explain',
        { question: 'What happens on payment fail?' },
        { headers: { Authorization: 'Bearer test_token' } }
      );
      expect(result).toEqual(mockResponse);
      expect(aiService.lastExplanation()).toEqual(mockResponse.explanation);
      expect(aiService.explaining()).toBe(false);
    });
  });

  describe('exportMermaid & importMermaid', () => {
    it('should export canvas to mermaid syntax', () => {
      const mockResponse: MermaidExportResponse = {
        mermaid: 'graph TD\n  A[API Gateway] --> B[Database]'
      };

      mockHttpClient.post.mockReturnValue(of(mockResponse));

      let result: MermaidExportResponse | undefined;
      aiService.exportMermaid('brd_123', { direction: 'TD' }).subscribe((res) => {
        result = res;
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/boards/brd_123/ai/mermaid/export',
        { direction: 'TD' },
        { headers: { Authorization: 'Bearer test_token' } }
      );
      expect(result).toEqual(mockResponse);
      expect(aiService.lastMermaidCode()).toBe('graph TD\n  A[API Gateway] --> B[Database]');
      expect(aiService.exportingMermaid()).toBe(false);
    });

    it('should import mermaid diagram and return operations', () => {
      const mockResponse: MermaidImportResponse = {
        diagram: {
          nodes: [{ id: 'A', type: 'gateway', label: 'API Gateway', x: 0, y: 0, width: 140, height: 70 }],
          edges: [],
          frames: []
        },
        operations: []
      };

      mockHttpClient.post.mockReturnValue(of(mockResponse));

      const req: MermaidImportRequest = {
        mermaid: 'graph LR\n  A[API Gateway] --> B[Auth Service]'
      };

      let result: MermaidImportResponse | undefined;
      aiService.importMermaid('brd_123', req).subscribe((res) => {
        result = res;
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/boards/brd_123/ai/mermaid/import',
        req,
        { headers: { Authorization: 'Bearer test_token' } }
      );
      expect(result).toEqual(mockResponse);
      expect(aiService.importingMermaid()).toBe(false);
    });
  });
});
