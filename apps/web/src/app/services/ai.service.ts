import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, throwError, finalize } from 'rxjs';
import { AuthService } from './auth.service';
import {
  GenerateRequest,
  GenerateResponse,
  ModifyRequest,
  ModifyResponse,
  AnalyzeRequest,
  AnalyzeResponse,
  ExplainRequest,
  ExplainResponse,
  MermaidExportRequest,
  MermaidExportResponse,
  MermaidImportRequest,
  MermaidImportResponse,
  AnalysisReport,
  ArchitectureExplanation,
  ArchitectureDiagram
} from '../models/ai.models';

@Injectable({
  providedIn: 'root'
})
export class AiService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  // Reactive state signals
  readonly generating = signal<boolean>(false);
  readonly modifying = signal<boolean>(false);
  readonly analyzing = signal<boolean>(false);
  readonly explaining = signal<boolean>(false);
  readonly exportingMermaid = signal<boolean>(false);
  readonly importingMermaid = signal<boolean>(false);

  readonly lastReport = signal<AnalysisReport | null>(null);
  readonly lastExplanation = signal<ArchitectureExplanation | null>(null);
  readonly lastGeneratedDiagram = signal<ArchitectureDiagram | null>(null);
  readonly lastMermaidCode = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  /**
   * Generates a complete architecture diagram from a natural language prompt.
   */
  generateDiagram(boardId: string, req: GenerateRequest): Observable<GenerateResponse> {
    this.generating.set(true);
    this.error.set(null);

    return this.http
      .post<GenerateResponse>(`/api/boards/${boardId}/ai/generate`, req, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        tap((res) => {
          this.lastGeneratedDiagram.set(res.diagram);
        }),
        catchError((err) => {
          const msg = err.error?.error || err.message || 'AI generation failed';
          this.error.set(msg);
          return throwError(() => err);
        }),
        finalize(() => this.generating.set(false))
      );
  }

  /**
   * Incrementally refines or transforms an existing canvas diagram topology.
   */
  modifyDiagram(boardId: string, req: ModifyRequest): Observable<ModifyResponse> {
    this.modifying.set(true);
    this.error.set(null);

    return this.http
      .post<ModifyResponse>(`/api/boards/${boardId}/ai/modify`, req, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        tap((res) => {
          this.lastGeneratedDiagram.set(res.diagram);
        }),
        catchError((err) => {
          const msg = err.error?.error || err.message || 'AI modification failed';
          this.error.set(msg);
          return throwError(() => err);
        }),
        finalize(() => this.modifying.set(false))
      );
  }

  /**
   * Runs an automated architectural inspection and security scan against current canvas components.
   */
  analyzeDiagram(boardId: string, req: AnalyzeRequest = {}): Observable<AnalyzeResponse> {
    this.analyzing.set(true);
    this.error.set(null);

    return this.http
      .post<AnalyzeResponse>(`/api/boards/${boardId}/ai/analyze`, req, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        tap((res) => {
          this.lastReport.set(res.report);
        }),
        catchError((err) => {
          const msg = err.error?.error || err.message || 'AI inspection scan failed';
          this.error.set(msg);
          return throwError(() => err);
        }),
        finalize(() => this.analyzing.set(false))
      );
  }

  /**
   * Generates a deep technical breakdown and answers questions about the diagram architecture.
   */
  explainDiagram(boardId: string, req: ExplainRequest = {}): Observable<ExplainResponse> {
    this.explaining.set(true);
    this.error.set(null);

    return this.http
      .post<ExplainResponse>(`/api/boards/${boardId}/ai/explain`, req, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        tap((res) => {
          this.lastExplanation.set(res.explanation);
        }),
        catchError((err) => {
          const msg = err.error?.error || err.message || 'AI explanation failed';
          this.error.set(msg);
          return throwError(() => err);
        }),
        finalize(() => this.explaining.set(false))
      );
  }

  /**
   * Exports the current board objects to Mermaid flowchart syntax.
   */
  exportMermaid(boardId: string, req: MermaidExportRequest = {}): Observable<MermaidExportResponse> {
    this.exportingMermaid.set(true);
    this.error.set(null);

    return this.http
      .post<MermaidExportResponse>(`/api/boards/${boardId}/ai/mermaid/export`, req, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        tap((res) => {
          this.lastMermaidCode.set(res.mermaid);
        }),
        catchError((err) => {
          const msg = err.error?.error || err.message || 'Mermaid export failed';
          this.error.set(msg);
          return throwError(() => err);
        }),
        finalize(() => this.exportingMermaid.set(false))
      );
  }

  /**
   * Imports a Mermaid flowchart diagram and converts it to canvas document operations.
   */
  importMermaid(boardId: string, req: MermaidImportRequest): Observable<MermaidImportResponse> {
    this.importingMermaid.set(true);
    this.error.set(null);

    return this.http
      .post<MermaidImportResponse>(`/api/boards/${boardId}/ai/mermaid/import`, req, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        catchError((err) => {
          const msg = err.error?.error || err.message || 'Mermaid import failed';
          this.error.set(msg);
          return throwError(() => err);
        }),
        finalize(() => this.importingMermaid.set(false))
      );
  }

  clearError(): void {
    this.error.set(null);
  }
}
