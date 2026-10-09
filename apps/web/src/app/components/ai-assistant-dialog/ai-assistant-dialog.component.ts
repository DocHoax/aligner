import {
  Component,
  OnInit,
  inject,
  signal,
  computed,
  input,
  ElementRef,
  viewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../services/ai.service';
import { CanvasEngineBridgeService } from '../../services/canvas-engine-bridge.service';
import { BoardService } from '../../services/board.service';
import {
  ArchitectureFinding,
  FindingCategory,
  FindingSeverity
} from '../../models/ai.models';

export type AiTab = 'generate' | 'modify' | 'analyze' | 'explain' | 'mermaid';

interface PromptPreset {
  title: string;
  description: string;
  prompt: string;
  direction?: 'LR' | 'TB';
}

const GENERATE_PRESETS: PromptPreset[] = [
  {
    title: 'E-Commerce Microservices',
    description: 'API Gateway, Auth, Order & Inventory services with PostgreSQL & Redis',
    prompt: 'Design a high-scale e-commerce platform with an API gateway, authentication service, order management microservice with PostgreSQL, catalog service with MongoDB, inventory service, and Redis caching layer.',
    direction: 'LR'
  },
  {
    title: 'Event-Driven Payments',
    description: 'Kafka event bus, payment workers, ledger database & webhook dispatcher',
    prompt: 'Design an event-driven payment processing pipeline using Apache Kafka, payment ingestion gateway, fraud detection worker, payment ledger database with ACID compliance, and webhook dispatch service.',
    direction: 'LR'
  },
  {
    title: 'Real-Time IoT Analytics',
    description: 'MQTT broker, stream processing cluster, time-series storage & dashboards',
    prompt: 'Create a real-time IoT telemetry ingestion architecture with MQTT broker, stream processing cluster, Cassandra time-series database, cold S3 storage, and real-time visualization dashboard service.',
    direction: 'TB'
  },
  {
    title: 'AI RAG Inference Pipeline',
    description: 'LLM Gateway, vector embeddings database, document ingestion & cache',
    prompt: 'Build a production Retrieval-Augmented Generation (RAG) system with an LLM inference gateway, Milvus vector database, background document embedding workers, Redis semantic cache, and PostgreSQL metadata store.',
    direction: 'LR'
  }
];

const MODIFY_PRESETS: PromptPreset[] = [
  {
    title: 'Add Distributed Caching',
    description: 'Introduce a Redis cache cluster between gateways and data services',
    prompt: 'Add a high-availability Redis cache cluster between the API gateway and backend microservices with read-through caching topology.'
  },
  {
    title: 'Add Asynchronous Queue',
    description: 'Decouple heavy tasks with RabbitMQ/SQS and background worker pool',
    prompt: 'Insert a RabbitMQ asynchronous task queue with auto-scaling background workers to decouple long-running processing jobs from the user API.'
  },
  {
    title: 'Introduce Zero-Trust Auth',
    description: 'Add OAuth2/OIDC identity provider and token verification layer',
    prompt: 'Add an OAuth2/OIDC identity provider with JWT token verification middleware protecting all ingress traffic and internal RPC calls.'
  },
  {
    title: 'Add Read Replica & CDC',
    description: 'Configure database read replica and Debezium change-data-capture stream',
    prompt: 'Add a database read replica for analytical queries and connect Debezium CDC streaming events into an event bus.'
  }
];

const SAMPLE_MERMAID = `graph LR
    Client[Web & Mobile Clients] --> Cloudflare[Cloudflare CDN & WAF]
    Cloudflare --> APIGateway[API Gateway / Envoy]

    subgraph Core Services [Kubernetes Cluster]
        APIGateway --> AuthService[Auth Service]
        APIGateway --> OrderService[Order Service]
        APIGateway --> CatalogService[Catalog Service]

        OrderService --> RedisCache[(Redis Cache)]
        OrderService --> OrderDB[(PostgreSQL Primary)]
        CatalogService --> CatalogDB[(MongoDB Cluster)]

        OrderService -.->|OrderPlaced Event| Kafka[Kafka Event Bus]
        Kafka -.-> PaymentWorker[Payment Worker]
        Kafka -.-> NotificationWorker[Notification Worker]
    end

    subgraph External
        PaymentWorker --> Stripe[Stripe Payments API]
        NotificationWorker --> SendGrid[SendGrid Email API]
    end`;

@Component({
  selector: 'app-ai-assistant-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (isOpen()) {
      <div
        class="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
        (click)="close()"
        (keydown.escape)="close()"
      >
        <div
          class="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150 text-slate-100"
          (click)="$event.stopPropagation()"
        >
          <!-- Header Bar -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                </svg>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h2 class="text-base font-bold text-white tracking-tight">AI Architecture Assistant</h2>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                    Smart Engine
                  </span>
                </div>
                <p class="text-xs text-slate-400">Generate, refine, audit, and explain system architectures with AI</p>
              </div>
            </div>

            <button
              (click)="close()"
              class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Close (Esc)"
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Navigation Tabs Bar -->
          <div class="flex items-center px-6 border-b border-slate-800 bg-slate-900/90 gap-1 overflow-x-auto">
            <button
              (click)="activeTab.set('generate')"
              class="px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition"
              [class.border-indigo-500]="activeTab() === 'generate'"
              [class.text-indigo-400]="activeTab() === 'generate'"
              [class.border-transparent]="activeTab() !== 'generate'"
              [class.text-slate-400]="activeTab() !== 'generate'"
              [class.hover:text-slate-200]="activeTab() !== 'generate'"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              <span>1. Generate</span>
            </button>

            <button
              (click)="activeTab.set('modify')"
              class="px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition"
              [class.border-indigo-500]="activeTab() === 'modify'"
              [class.text-indigo-400]="activeTab() === 'modify'"
              [class.border-transparent]="activeTab() !== 'modify'"
              [class.text-slate-400]="activeTab() !== 'modify'"
              [class.hover:text-slate-200]="activeTab() !== 'modify'"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span>2. Refine & Modify</span>
            </button>

            <button
              (click)="activeTab.set('analyze')"
              class="px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition"
              [class.border-indigo-500]="activeTab() === 'analyze'"
              [class.text-indigo-400]="activeTab() === 'analyze'"
              [class.border-transparent]="activeTab() !== 'analyze'"
              [class.text-slate-400]="activeTab() !== 'analyze'"
              [class.hover:text-slate-200]="activeTab() !== 'analyze'"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>3. Inspect & Audit</span>
              @if (aiService.lastReport()?.findings?.length) {
                <span class="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {{ aiService.lastReport()?.findings?.length }}
                </span>
              }
            </button>

            <button
              (click)="activeTab.set('explain')"
              class="px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition"
              [class.border-indigo-500]="activeTab() === 'explain'"
              [class.text-indigo-400]="activeTab() === 'explain'"
              [class.border-transparent]="activeTab() !== 'explain'"
              [class.text-slate-400]="activeTab() !== 'explain'"
              [class.hover:text-slate-200]="activeTab() !== 'explain'"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>4. Technical Breakdown</span>
            </button>

            <button
              (click)="activeTab.set('mermaid')"
              class="px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition"
              [class.border-indigo-500]="activeTab() === 'mermaid'"
              [class.text-indigo-400]="activeTab() === 'mermaid'"
              [class.border-transparent]="activeTab() !== 'mermaid'"
              [class.text-slate-400]="activeTab() !== 'mermaid'"
              [class.hover:text-slate-200]="activeTab() !== 'mermaid'"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>5. Mermaid Flowchart</span>
            </button>
          </div>

          <!-- Error Alert Banner -->
          @if (aiService.error()) {
            <div class="mx-6 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between animate-in fade-in duration-100">
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{{ aiService.error() }}</span>
              </div>
              <button (click)="aiService.clearError()" class="text-rose-400 hover:text-white text-xs font-medium">
                Dismiss
              </button>
            </div>
          }

          <!-- Tab Content Body Area -->
          <div class="flex-1 overflow-y-auto p-6 space-y-6">
            <!-- ================= TAB 1: GENERATE ================= -->
            @if (activeTab() === 'generate') {
              <div class="space-y-5 animate-in fade-in duration-100">
                <!-- Prompt Input Box -->
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <label class="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Architecture Description & Requirements
                    </label>
                    <span class="text-[11px] text-slate-500">Natural language to topology</span>
                  </div>
                  <textarea
                    #generateInput
                    [(ngModel)]="generatePrompt"
                    rows="4"
                    placeholder="Describe your architecture requirements (e.g., 'A globally distributed fintech service with payment gateways, Redis caching, PostgreSQL master-replica, and event streaming')..."
                    class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-sans leading-relaxed"
                  ></textarea>
                </div>

                <!-- Layout Options -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div class="space-y-1.5">
                    <label class="text-xs font-semibold text-slate-400">Layout Flow Direction</label>
                    <div class="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        (click)="generateDirection = 'LR'"
                        class="px-3 py-2 rounded-xl text-xs font-medium border flex items-center justify-center gap-2 transition"
                        [class.bg-indigo-600]="generateDirection === 'LR'"
                        [class.border-indigo-500]="generateDirection === 'LR'"
                        [class.text-white]="generateDirection === 'LR'"
                        [class.bg-slate-950]="generateDirection !== 'LR'"
                        [class.border-slate-800]="generateDirection !== 'LR'"
                        [class.text-slate-400]="generateDirection !== 'LR'"
                      >
                        <span>Left to Right (LR)</span>
                      </button>
                      <button
                        type="button"
                        (click)="generateDirection = 'TB'"
                        class="px-3 py-2 rounded-xl text-xs font-medium border flex items-center justify-center gap-2 transition"
                        [class.bg-indigo-600]="generateDirection === 'TB'"
                        [class.border-indigo-500]="generateDirection === 'TB'"
                        [class.text-white]="generateDirection === 'TB'"
                        [class.bg-slate-950]="generateDirection !== 'TB'"
                        [class.border-slate-800]="generateDirection !== 'TB'"
                        [class.text-slate-400]="generateDirection !== 'TB'"
                      >
                        <span>Top to Bottom (TB)</span>
                      </button>
                    </div>
                  </div>

                  <div class="space-y-1.5">
                    <label class="text-xs font-semibold text-slate-400">Style Aesthetic</label>
                    <select
                      [(ngModel)]="generateStylePreset"
                      class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="modern-dark">Modern Dark Cloud</option>
                      <option value="cyber-indigo">Cyber Indigo Matrix</option>
                      <option value="minimal-slate">Minimal Slate</option>
                      <option value="enterprise-azure">Enterprise Cloud</option>
                    </select>
                  </div>
                </div>

                <!-- Example Presets Grid -->
                <div class="space-y-2">
                  <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Quick Templates & Presets</span>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    @for (preset of generatePresets; track preset.title) {
                      <button
                        type="button"
                        (click)="selectGeneratePreset(preset)"
                        class="text-left p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-indigo-500/50 hover:bg-slate-800/40 transition-all group"
                      >
                        <div class="text-xs font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors">
                          {{ preset.title }}
                        </div>
                        <div class="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                          {{ preset.description }}
                        </div>
                      </button>
                    }
                  </div>
                </div>

                <!-- Generate Action Button -->
                <div class="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    (click)="runGenerate()"
                    [disabled]="!generatePrompt.trim() || aiService.generating()"
                    class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-2"
                  >
                    @if (aiService.generating()) {
                      <svg class="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Synthesizing Topology...</span>
                    } @else {
                      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>Generate Architecture Diagram</span>
                    }
                  </button>
                </div>
              </div>
            }

            <!-- ================= TAB 2: REFINE / MODIFY ================= -->
            @if (activeTab() === 'modify') {
              <div class="space-y-5 animate-in fade-in duration-100">
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <label class="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Topology Refinement Instructions
                    </label>
                    <span class="text-[11px] text-slate-400 font-mono">
                      Current Objects on Canvas: {{ currentObjectCount() }}
                    </span>
                  </div>
                  <textarea
                    [(ngModel)]="modifyPrompt"
                    rows="4"
                    placeholder="Specify structural adjustments (e.g. 'Add Redis cache between Gateway and Catalog Service', 'Add a dead-letter queue and notification worker')..."
                    class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-sans leading-relaxed"
                  ></textarea>
                </div>

                <!-- Scope Selection -->
                <div class="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div>
                    <div class="text-xs font-semibold text-slate-200">Refinement Scope</div>
                    <div class="text-[11px] text-slate-500">Apply modification to selected nodes or entire board</div>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      (click)="modifySelectedOnly = false"
                      class="px-3 py-1.5 rounded-lg text-xs font-medium border transition"
                      [class.bg-indigo-600]="!modifySelectedOnly"
                      [class.border-indigo-500]="!modifySelectedOnly"
                      [class.text-white]="!modifySelectedOnly"
                      [class.bg-slate-900]="modifySelectedOnly"
                      [class.border-slate-800]="modifySelectedOnly"
                      [class.text-slate-400]="modifySelectedOnly"
                    >
                      Entire Board
                    </button>
                    <button
                      type="button"
                      (click)="modifySelectedOnly = true"
                      [disabled]="selectedObjectCount() === 0"
                      class="px-3 py-1.5 rounded-lg text-xs font-medium border transition disabled:opacity-40 disabled:cursor-not-allowed"
                      [class.bg-indigo-600]="modifySelectedOnly"
                      [class.border-indigo-500]="modifySelectedOnly"
                      [class.text-white]="modifySelectedOnly"
                      [class.bg-slate-900]="!modifySelectedOnly"
                      [class.border-slate-800]="!modifySelectedOnly"
                      [class.text-slate-400]="!modifySelectedOnly"
                    >
                      Selected Only ({{ selectedObjectCount() }})
                    </button>
                  </div>
                </div>

                <!-- Refinement Presets -->
                <div class="space-y-2">
                  <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Common Refinements</span>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    @for (preset of modifyPresets; track preset.title) {
                      <button
                        type="button"
                        (click)="selectModifyPreset(preset)"
                        class="text-left p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-indigo-500/50 hover:bg-slate-800/40 transition-all group"
                      >
                        <div class="text-xs font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors">
                          {{ preset.title }}
                        </div>
                        <div class="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                          {{ preset.description }}
                        </div>
                      </button>
                    }
                  </div>
                </div>

                <!-- Refine Action Button -->
                <div class="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    (click)="runModify()"
                    [disabled]="!modifyPrompt.trim() || aiService.modifying()"
                    class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-2"
                  >
                    @if (aiService.modifying()) {
                      <svg class="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Transforming Topology...</span>
                    } @else {
                      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Apply AI Refinement</span>
                    }
                  </button>
                </div>
              </div>
            }

            <!-- ================= TAB 3: INSPECT & AUDIT ================= -->
            @if (activeTab() === 'analyze') {
              <div class="space-y-6 animate-in fade-in duration-100">
                <!-- Trigger Bar -->
                <div class="flex items-center justify-between p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <div>
                    <div class="text-sm font-semibold text-slate-100">Architecture Security & Reliability Audit</div>
                    <div class="text-xs text-slate-400">Scans for Single Points of Failure (SPOF), security trust violations, and anti-patterns</div>
                  </div>
                  <button
                    type="button"
                    (click)="runAnalyze()"
                    [disabled]="aiService.analyzing()"
                    class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-500/20 disabled:opacity-40 transition flex items-center gap-2"
                  >
                    @if (aiService.analyzing()) {
                      <svg class="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Auditing Architecture...</span>
                    } @else {
                      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <span>Run Inspection Scan</span>
                    }
                  </button>
                </div>

                @if (aiService.lastReport(); as report) {
                  <!-- Score Card & Severity Badges -->
                  <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <!-- Overall Score -->
                    <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-4">
                      <div
                        class="w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-bold text-lg border"
                        [ngClass]="{
                          'bg-emerald-500/20 text-emerald-300 border-emerald-500/40': report.overallScore >= 80,
                          'bg-amber-500/20 text-amber-300 border-amber-500/40': report.overallScore >= 50 && report.overallScore < 80,
                          'bg-rose-500/20 text-rose-300 border-rose-500/40': report.overallScore < 50
                        }"
                      >
                        {{ report.overallScore }}
                        <span class="text-[9px] font-normal opacity-80">/ 100</span>
                      </div>
                      <div>
                        <div class="text-xs font-semibold text-slate-200">Architecture Health</div>
                        <div class="text-[11px] text-slate-500">
                          {{ report.overallScore >= 80 ? 'Production Ready' : (report.overallScore >= 50 ? 'Requires Hardening' : 'Critical Defects') }}
                        </div>
                      </div>
                    </div>

                    <!-- Critical Count -->
                    <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <div>
                        <div class="text-[11px] text-slate-400 uppercase font-semibold">Critical</div>
                        <div class="text-xl font-bold text-rose-400">{{ report.criticalCount }}</div>
                      </div>
                      <div class="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                    </div>

                    <!-- High Count -->
                    <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <div>
                        <div class="text-[11px] text-slate-400 uppercase font-semibold">High</div>
                        <div class="text-xl font-bold text-amber-400">{{ report.highCount }}</div>
                      </div>
                      <div class="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>

                    <!-- Medium & Low Count -->
                    <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <div>
                        <div class="text-[11px] text-slate-400 uppercase font-semibold">Med / Low / Info</div>
                        <div class="text-xl font-bold text-indigo-300">
                          {{ report.mediumCount + report.lowCount + report.infoCount }}
                        </div>
                      </div>
                      <div class="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <!-- Findings List -->
                  <div class="space-y-3">
                    <div class="flex items-center justify-between">
                      <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        Detailed Findings ({{ report.findings.length }})
                      </h3>
                      <!-- Filter by category -->
                      <div class="flex items-center gap-1.5">
                        <button
                          (click)="findingCategoryFilter.set(null)"
                          class="px-2 py-0.5 rounded text-[10px] font-medium transition"
                          [class.bg-indigo-600]="findingCategoryFilter() === null"
                          [class.text-white]="findingCategoryFilter() === null"
                          [class.bg-slate-800]="findingCategoryFilter() !== null"
                          [class.text-slate-400]="findingCategoryFilter() !== null"
                        >
                          All
                        </button>
                        <button
                          (click)="findingCategoryFilter.set('spof')"
                          class="px-2 py-0.5 rounded text-[10px] font-medium transition"
                          [class.bg-indigo-600]="findingCategoryFilter() === 'spof'"
                          [class.text-white]="findingCategoryFilter() === 'spof'"
                          [class.bg-slate-800]="findingCategoryFilter() !== 'spof'"
                          [class.text-slate-400]="findingCategoryFilter() !== 'spof'"
                        >
                          SPOF
                        </button>
                        <button
                          (click)="findingCategoryFilter.set('security')"
                          class="px-2 py-0.5 rounded text-[10px] font-medium transition"
                          [class.bg-indigo-600]="findingCategoryFilter() === 'security'"
                          [class.text-white]="findingCategoryFilter() === 'security'"
                          [class.bg-slate-800]="findingCategoryFilter() !== 'security'"
                          [class.text-slate-400]="findingCategoryFilter() !== 'security'"
                        >
                          Security
                        </button>
                      </div>
                    </div>

                    @if (filteredFindings().length === 0) {
                      <div class="p-8 text-center bg-slate-950/40 rounded-xl border border-slate-800/60 text-slate-400 text-xs">
                        No findings match the selected filter.
                      </div>
                    } @else {
                      <div class="space-y-3">
                        @for (finding of filteredFindings(); track finding.id) {
                          <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                            <div class="flex items-start justify-between gap-3">
                              <div class="space-y-1">
                                <div class="flex items-center gap-2">
                                  <span
                                    class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border"
                                    [ngClass]="getSeverityBadgeClass(finding.severity)"
                                  >
                                    {{ finding.severity }}
                                  </span>
                                  <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700 uppercase">
                                    {{ finding.category }}
                                  </span>
                                  <span class="text-xs font-bold text-slate-100">{{ finding.title }}</span>
                                </div>
                                <p class="text-xs text-slate-300 leading-relaxed">{{ finding.description }}</p>
                              </div>

                              @if (finding.affectedNodeIds.length > 0) {
                                <button
                                  type="button"
                                  (click)="focusFinding(finding)"
                                  class="px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold shrink-0 transition flex items-center gap-1.5"
                                  title="Pan and zoom camera to affected canvas objects"
                                >
                                  <svg class="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                  <span>Locate on Canvas</span>
                                </button>
                              }
                            </div>

                            <!-- Remediation Recommendation -->
                            <div class="p-2.5 rounded-lg bg-indigo-950/30 border border-indigo-500/20 flex items-start gap-2">
                              <svg class="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <div class="text-[11px] text-indigo-200">
                                <span class="font-semibold text-indigo-300">Recommendation: </span>
                                {{ finding.recommendation }}
                              </div>
                            </div>
                          </div>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            }

            <!-- ================= TAB 4: EXPLAIN ================= -->
            @if (activeTab() === 'explain') {
              <div class="space-y-5 animate-in fade-in duration-100">
                <div class="space-y-2">
                  <label class="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Targeted Architecture Question (Optional)
                  </label>
                  <div class="flex items-center gap-2">
                    <input
                      type="text"
                      [(ngModel)]="explainQuestion"
                      placeholder="e.g. 'How does a payment transaction traverse the system?' or leave blank for a full breakdown..."
                      class="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                      (keydown.enter)="runExplain()"
                    />
                    <button
                      type="button"
                      (click)="runExplain()"
                      [disabled]="aiService.explaining()"
                      class="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-500/20 disabled:opacity-40 transition flex items-center gap-2 shrink-0"
                    >
                      @if (aiService.explaining()) {
                        <svg class="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Analyzing...</span>
                      } @else {
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        <span>Generate Breakdown</span>
                      }
                    </button>
                  </div>
                </div>

                @if (aiService.lastExplanation(); as exp) {
                  <div class="space-y-4 pt-2">
                    <!-- Executive Summary -->
                    <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                      <div class="text-xs font-bold uppercase tracking-wider text-indigo-400">Executive Summary</div>
                      <p class="text-xs text-slate-200 leading-relaxed">{{ exp.summary }}</p>
                    </div>

                    <!-- Step-by-Step Data Flow -->
                    @if (exp.dataFlowJourney.length > 0) {
                      <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                        <div class="text-xs font-bold uppercase tracking-wider text-purple-400">End-to-End Data Flow Journey</div>
                        <ol class="space-y-2">
                          @for (step of exp.dataFlowJourney; track $index; let idx = $index) {
                            <li class="flex items-start gap-2.5 text-xs text-slate-300">
                              <span class="w-5 h-5 rounded-full bg-purple-600/30 border border-purple-500/40 text-purple-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                {{ idx + 1 }}
                              </span>
                              <span class="leading-relaxed">{{ step }}</span>
                            </li>
                          }
                        </ol>
                      </div>
                    }

                    <!-- Failure Modes & Resilience -->
                    @if (exp.failureModes.length > 0) {
                      <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                        <div class="text-xs font-bold uppercase tracking-wider text-amber-400">Failure Modes & Fault Tolerance</div>
                        <ul class="space-y-2">
                          @for (mode of exp.failureModes; track $index) {
                            <li class="flex items-start gap-2 text-xs text-slate-300">
                              <span class="text-amber-400 mt-1">•</span>
                              <span class="leading-relaxed">{{ mode }}</span>
                            </li>
                          }
                        </ul>
                      </div>
                    }

                    <!-- Scaling & Bottlenecks -->
                    @if (exp.scalingCharacteristics.length > 0) {
                      <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                        <div class="text-xs font-bold uppercase tracking-wider text-emerald-400">Scalability & Bottlenecks</div>
                        <ul class="space-y-2">
                          @for (scale of exp.scalingCharacteristics; track $index) {
                            <li class="flex items-start gap-2 text-xs text-slate-300">
                              <span class="text-emerald-400 mt-1">•</span>
                              <span class="leading-relaxed">{{ scale }}</span>
                            </li>
                          }
                        </ul>
                      </div>
                    }
                  </div>
                }
              </div>
            }

            <!-- ================= TAB 5: MERMAID ================= -->
            @if (activeTab() === 'mermaid') {
              <div class="space-y-5 animate-in fade-in duration-100">
                <!-- Sub Mode Toggle -->
                <div class="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div>
                    <div class="text-xs font-semibold text-slate-200">Mermaid Flowchart Interoperability</div>
                    <div class="text-[11px] text-slate-500">Bi-directional conversion between Mermaid syntax and Alignify canvas objects</div>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      (click)="mermaidMode = 'export'"
                      class="px-3 py-1.5 rounded-lg text-xs font-medium border transition"
                      [class.bg-indigo-600]="mermaidMode === 'export'"
                      [class.border-indigo-500]="mermaidMode === 'export'"
                      [class.text-white]="mermaidMode === 'export'"
                      [class.bg-slate-900]="mermaidMode !== 'export'"
                      [class.border-slate-800]="mermaidMode !== 'export'"
                      [class.text-slate-400]="mermaidMode !== 'export'"
                    >
                      Export from Canvas
                    </button>
                    <button
                      type="button"
                      (click)="mermaidMode = 'import'"
                      class="px-3 py-1.5 rounded-lg text-xs font-medium border transition"
                      [class.bg-indigo-600]="mermaidMode === 'import'"
                      [class.border-indigo-500]="mermaidMode === 'import'"
                      [class.text-white]="mermaidMode === 'import'"
                      [class.bg-slate-900]="mermaidMode !== 'import'"
                      [class.border-slate-800]="mermaidMode !== 'import'"
                      [class.text-slate-400]="mermaidMode !== 'import'"
                    >
                      Import to Canvas
                    </button>
                  </div>
                </div>

                @if (mermaidMode === 'export') {
                  <!-- Export Section -->
                  <div class="space-y-3">
                    <div class="flex items-center justify-between">
                      <label class="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        Generated Mermaid Flowchart Code
                      </label>
                      <div class="flex items-center gap-2">
                        <button
                          type="button"
                          (click)="runExportMermaid()"
                          [disabled]="aiService.exportingMermaid()"
                          class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition flex items-center gap-1.5"
                        >
                          @if (aiService.exportingMermaid()) {
                            <svg class="animate-spin w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24">
                              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          }
                          <span>Serialize Current Board</span>
                        </button>

                        @if (aiService.lastMermaidCode()) {
                          <button
                            type="button"
                            (click)="copyMermaidCode()"
                            class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition flex items-center gap-1.5"
                          >
                            @if (mermaidCopied()) {
                              <svg class="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                              </svg>
                              <span>Copied!</span>
                            } @else {
                              <svg class="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                              </svg>
                              <span>Copy Mermaid</span>
                            }
                          </button>
                        }
                      </div>
                    </div>

                    <textarea
                      readonly
                      [value]="aiService.lastMermaidCode() || 'Click [Serialize Current Board] to generate Mermaid flowchart syntax from your current canvas components...'"
                      rows="9"
                      class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-emerald-400 font-mono focus:outline-none select-all"
                    ></textarea>
                  </div>
                } @else {
                  <!-- Import Section -->
                  <div class="space-y-3">
                    <div class="flex items-center justify-between">
                      <label class="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        Paste Mermaid Flowchart Code
                      </label>
                      <button
                        type="button"
                        (click)="loadSampleMermaid()"
                        class="text-[11px] text-indigo-400 hover:text-indigo-300 transition"
                      >
                        Load Sample Mermaid
                      </button>
                    </div>

                    <textarea
                      [(ngModel)]="mermaidInput"
                      rows="8"
                      placeholder="graph LR&#10;    A[API Gateway] --> B[(PostgreSQL Database)]"
                      class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-indigo-300 font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    ></textarea>

                    <div class="pt-1 flex items-center justify-end">
                      <button
                        type="button"
                        (click)="runImportMermaid()"
                        [disabled]="!mermaidInput.trim() || aiService.importingMermaid()"
                        class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-2"
                      >
                        @if (aiService.importingMermaid()) {
                          <svg class="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Parsing & Rendering...</span>
                        } @else {
                          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          <span>Import & Render onto Canvas</span>
                        }
                      </button>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    }
  `
})
export class AiAssistantDialogComponent implements OnInit {
  readonly boardId = input<string>('');
  readonly aiService = inject(AiService);
  readonly bridge = inject(CanvasEngineBridgeService);
  readonly boardService = inject(BoardService);

  readonly isOpen = signal(false);
  readonly activeTab = signal<AiTab>('generate');

  // Generate Tab State
  generatePrompt = '';
  generateDirection: 'LR' | 'TB' = 'LR';
  generateStylePreset = 'modern-dark';
  readonly generatePresets = GENERATE_PRESETS;

  // Modify Tab State
  modifyPrompt = '';
  modifySelectedOnly = false;
  readonly modifyPresets = MODIFY_PRESETS;

  // Inspect Tab State
  readonly findingCategoryFilter = signal<FindingCategory | null>(null);

  // Explain Tab State
  explainQuestion = '';

  // Mermaid Tab State
  mermaidMode: 'export' | 'import' = 'export';
  mermaidInput = '';
  readonly mermaidCopied = signal(false);

  readonly currentObjectCount = computed(() => this.bridge.allObjects().length);
  readonly selectedObjectCount = computed(() => this.bridge.selectedCount());

  readonly filteredFindings = computed(() => {
    const report = this.aiService.lastReport();
    if (!report) return [];
    const cat = this.findingCategoryFilter();
    if (!cat) return report.findings;
    return report.findings.filter((f) => f.category === cat);
  });

  readonly generateInputRef = viewChild<ElementRef<HTMLTextAreaElement>>('generateInput');

  ngOnInit(): void {
    // Component lifecycle initialized
  }

  open(tab: AiTab = 'generate'): void {
    this.activeTab.set(tab);
    this.isOpen.set(true);
    this.aiService.clearError();
    if (tab === 'generate') {
      setTimeout(() => {
        if (typeof this.generateInputRef === 'function') {
          this.generateInputRef()?.nativeElement?.focus();
        }
      }, 50);
    }
  }

  close(): void {
    this.isOpen.set(false);
  }

  selectGeneratePreset(preset: PromptPreset): void {
    this.generatePrompt = preset.prompt;
    if (preset.direction) {
      this.generateDirection = preset.direction;
    }
  }

  selectModifyPreset(preset: PromptPreset): void {
    this.modifyPrompt = preset.prompt;
  }

  loadSampleMermaid(): void {
    this.mermaidInput = SAMPLE_MERMAID;
  }

  runGenerate(): void {
    const prompt = this.generatePrompt.trim();
    const bid = this.boardId() || this.boardService.currentBoard()?.id || 'board_default';
    if (!prompt) return;

    this.aiService
      .generateDiagram(bid, {
        prompt,
        layoutDirection: this.generateDirection,
        stylePreset: this.generateStylePreset
      })
      .subscribe({
        next: (res) => {
          if (res.operations && res.operations.length > 0) {
            this.bridge.applyOperations(res.operations, true);
          }
          this.close();
        },
        error: () => {
          // Handled by signal in aiService
        }
      });
  }

  runModify(): void {
    const prompt = this.modifyPrompt.trim();
    const bid = this.boardId() || this.boardService.currentBoard()?.id || 'board_default';
    if (!prompt) return;

    const existing = this.bridge.getCurrentObjects();
    const selectedIds = this.modifySelectedOnly
      ? this.bridge.selectedObjects().map((o) => o.id)
      : undefined;

    this.aiService
      .modifyDiagram(bid, {
        prompt,
        existingObjects: existing as unknown as Array<Record<string, unknown>>,
        selectedIds
      })
      .subscribe({
        next: (res) => {
          if (res.operations && res.operations.length > 0) {
            this.bridge.applyOperations(res.operations, true, res.addedNodeIds);
          }
          this.close();
        },
        error: () => {
          // Handled by signal
        }
      });
  }

  runAnalyze(): void {
    const bid = this.boardId() || this.boardService.currentBoard()?.id || 'board_default';
    const existing = this.bridge.getCurrentObjects();

    this.aiService
      .analyzeDiagram(bid, {
        objects: existing as unknown as Array<Record<string, unknown>>
      })
      .subscribe();
  }

  runExplain(): void {
    const bid = this.boardId() || this.boardService.currentBoard()?.id || 'board_default';
    const existing = this.bridge.getCurrentObjects();

    this.aiService
      .explainDiagram(bid, {
        objects: existing as unknown as Array<Record<string, unknown>>,
        question: this.explainQuestion.trim() || undefined
      })
      .subscribe();
  }

  runExportMermaid(): void {
    const bid = this.boardId() || this.boardService.currentBoard()?.id || 'board_default';
    const existing = this.bridge.getCurrentObjects();

    this.aiService
      .exportMermaid(bid, {
        objects: existing as unknown as Array<Record<string, unknown>>,
        direction: 'LR'
      })
      .subscribe();
  }

  copyMermaidCode(): void {
    const code = this.aiService.lastMermaidCode();
    if (!code) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        this.mermaidCopied.set(true);
        setTimeout(() => this.mermaidCopied.set(false), 2000);
      });
    }
  }

  runImportMermaid(): void {
    const bid = this.boardId() || this.boardService.currentBoard()?.id || 'board_default';
    const mermaid = this.mermaidInput.trim();
    if (!mermaid) return;

    this.aiService
      .importMermaid(bid, {
        mermaid
      })
      .subscribe({
        next: (res) => {
          if (res.operations && res.operations.length > 0) {
            this.bridge.applyOperations(res.operations, true);
          }
          this.close();
        }
      });
  }

  focusFinding(finding: ArchitectureFinding): void {
    if (finding.affectedNodeIds.length > 0) {
      this.bridge.focusObjects(finding.affectedNodeIds);
      this.close();
    }
  }

  getSeverityBadgeClass(severity: FindingSeverity): Record<string, boolean> {
    return {
      'bg-rose-500/20 text-rose-300 border-rose-500/40': severity === 'critical',
      'bg-amber-500/20 text-amber-300 border-amber-500/40': severity === 'high',
      'bg-indigo-500/20 text-indigo-300 border-indigo-500/40': severity === 'medium',
      'bg-blue-500/20 text-blue-300 border-blue-500/40': severity === 'low',
      'bg-slate-800 text-slate-400 border-slate-700': severity === 'info'
    };
  }
}
