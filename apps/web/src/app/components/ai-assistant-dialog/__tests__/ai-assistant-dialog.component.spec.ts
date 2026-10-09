import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { AiAssistantDialogComponent } from '../ai-assistant-dialog.component';
import { ArchitectureFinding } from '../../../models/ai.models';

describe('AiAssistantDialogComponent', () => {
  let component: AiAssistantDialogComponent;
  let mockAiService: any;
  let mockBridge: any;
  let mockBoardService: any;

  beforeEach(() => {
    mockAiService = {
      generating: signal(false),
      modifying: signal(false),
      analyzing: signal(false),
      explaining: signal(false),
      exportingMermaid: signal(false),
      importingMermaid: signal(false),
      lastReport: signal(null),
      lastExplanation: signal(null),
      lastGeneratedDiagram: signal(null),
      lastMermaidCode: signal(null),
      error: signal(null),
      clearError: vi.fn(),
      generateDiagram: vi.fn(),
      modifyDiagram: vi.fn(),
      analyzeDiagram: vi.fn(),
      explainDiagram: vi.fn(),
      exportMermaid: vi.fn(),
      importMermaid: vi.fn()
    };

    mockBridge = {
      applyOperations: vi.fn(),
      focusObjects: vi.fn(),
      getCurrentObjects: vi.fn().mockReturnValue([]),
      selectedObjects: signal([])
    };

    mockBoardService = {
      currentBoard: signal({ id: 'brd_test_1', name: 'Test Board' })
    };

    component = Object.create(AiAssistantDialogComponent.prototype);
    (component as any).aiService = mockAiService;
    (component as any).bridge = mockBridge;
    (component as any).boardService = mockBoardService;

    // Signals & fields
    const boardIdSignal = signal('brd_test_1');
    (component as any).boardId = boardIdSignal;
    (component as any).isOpen = signal(false);
    (component as any).activeTab = signal('generate');
    (component as any).findingCategoryFilter = signal(null);
    (component as any).mermaidCopied = signal(false);
    (component as any).generateInputRef = () => null;

    component.generatePrompt = '';
    component.generateDirection = 'LR';
    component.generateStylePreset = 'modern-dark';
    component.modifyPrompt = '';
    component.modifySelectedOnly = false;
    component.explainQuestion = '';
    component.mermaidMode = 'export';
    component.mermaidInput = '';
  });

  describe('Modal Lifecycle & Tab Navigation', () => {
    it('should open dialog and set active tab', () => {
      component.open('analyze');
      expect(component.isOpen()).toBe(true);
      expect(component.activeTab()).toBe('analyze');
      expect(mockAiService.clearError).toHaveBeenCalled();
    });

    it('should close dialog', () => {
      component.open('generate');
      component.close();
      expect(component.isOpen()).toBe(false);
    });

    it('should switch active tab', () => {
      component.activeTab.set('explain');
      expect(component.activeTab()).toBe('explain');
    });

    it('should apply prompt presets', () => {
      component.selectGeneratePreset({
        title: 'E-commerce',
        description: 'E-commerce desc',
        prompt: 'Build a high-scale e-commerce architecture',
        direction: 'TB'
      });
      expect(component.generatePrompt).toBe('Build a high-scale e-commerce architecture');
      expect(component.generateDirection).toBe('TB');
    });

    it('should apply modify presets', () => {
      component.selectModifyPreset({
        title: 'Redis Cache',
        description: 'Redis desc',
        prompt: 'Introduce a Redis cache cluster'
      });
      expect(component.modifyPrompt).toBe('Introduce a Redis cache cluster');
    });
  });

  describe('AI Architecture Generation', () => {
    it('should call generateDiagram and apply resulting operations to the canvas bridge', () => {
      const mockOperations = [{ type: 'create_object', object: { id: 'node_1' } } as any];
      mockAiService.generateDiagram.mockReturnValue(
        of({
          diagram: { nodes: [], edges: [], frames: [] },
          operations: mockOperations,
          summary: 'Created diagram'
        })
      );

      component.generatePrompt = 'Serverless microservices platform';
      component.runGenerate();

      expect(mockAiService.generateDiagram).toHaveBeenCalledWith(
        'brd_test_1',
        {
          prompt: 'Serverless microservices platform',
          layoutDirection: 'LR',
          stylePreset: 'modern-dark'
        }
      );
      expect(mockBridge.applyOperations).toHaveBeenCalledWith(mockOperations, true);
      expect(component.isOpen()).toBe(false);
    });

    it('should not trigger generate if prompt is empty', () => {
      component.generatePrompt = '   ';
      component.runGenerate();
      expect(mockAiService.generateDiagram).not.toHaveBeenCalled();
    });
  });

  describe('AI Architecture Modification & Refinement', () => {
    it('should call modifyDiagram with selected object context', () => {
      const mockOperations = [{ type: 'update_object', id: 'node_1' } as any];
      mockAiService.modifyDiagram.mockReturnValue(
        of({
          diagram: { nodes: [], edges: [], frames: [] },
          operations: mockOperations,
          addedNodeIds: ['node_new'],
          modifiedNodeIds: [],
          deletedNodeIds: [],
          summary: 'Modified topology'
        })
      );

      mockBridge.selectedObjects.set([{ id: 'node_auth' }]);
      component.modifyPrompt = 'Add OAuth2 login provider';
      component.modifySelectedOnly = true;

      component.runModify();

      expect(mockAiService.modifyDiagram).toHaveBeenCalledWith(
        'brd_test_1',
        {
          prompt: 'Add OAuth2 login provider',
          existingObjects: [],
          selectedIds: ['node_auth']
        }
      );
      expect(mockBridge.applyOperations).toHaveBeenCalledWith(mockOperations, true, ['node_new']);
      expect(component.isOpen()).toBe(false);
    });
  });

  describe('Security Inspection & SPOF Audit', () => {
    it('should trigger inspection scan', () => {
      mockAiService.analyzeDiagram.mockReturnValue(of({ report: {} }));
      component.runAnalyze();

      expect(mockAiService.analyzeDiagram).toHaveBeenCalledWith('brd_test_1', {
        objects: []
      });
    });

    it('should focus finding nodes and close modal', () => {
      const finding: ArchitectureFinding = {
        id: 'find_spof',
        ruleId: 'spof_db',
        title: 'Single Point of Failure at Master DB',
        severity: 'critical',
        category: 'spof',
        description: 'No read-replicas configured',
        recommendation: 'Add aurora multi-az replica',
        affectedNodeIds: ['db_master_1'],
        affectedEdgeIds: []
      };

      component.focusFinding(finding);

      expect(mockBridge.focusObjects).toHaveBeenCalledWith(['db_master_1']);
      expect(component.isOpen()).toBe(false);
    });
  });

  describe('Mermaid Flowchart Import & Export', () => {
    it('should export diagram to mermaid flowchart', () => {
      mockAiService.exportMermaid.mockReturnValue(
        of({ mermaid: 'graph TD\n  A[Frontend] --> B[API]' })
      );

      component.runExportMermaid();

      expect(mockAiService.exportMermaid).toHaveBeenCalledWith('brd_test_1', {
        objects: [],
        direction: 'LR'
      });
    });

    it('should import mermaid code into canvas operations', () => {
      const mockOperations = [{ type: 'create_object', object: { id: 'A' } } as any];
      mockAiService.importMermaid.mockReturnValue(
        of({
          diagram: { nodes: [], edges: [], frames: [] },
          operations: mockOperations
        })
      );

      component.mermaidInput = 'graph LR\n  A[Gateway] --> B[Service]';
      component.runImportMermaid();

      expect(mockAiService.importMermaid).toHaveBeenCalledWith('brd_test_1', {
        mermaid: 'graph LR\n  A[Gateway] --> B[Service]'
      });
      expect(mockBridge.applyOperations).toHaveBeenCalledWith(mockOperations, true);
      expect(component.isOpen()).toBe(false);
    });
  });
});
