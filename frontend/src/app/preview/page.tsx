import * as React from "react";

import { CompactTaskCard } from "@/components/seller/dashboard/compact-task-card";
import { DashboardHeader } from "@/components/seller/dashboard/dashboard-header";
import { PriorityCard } from "@/components/seller/dashboard/priority-card";
import { QuietSummary } from "@/components/seller/dashboard/quiet-summary";
import { SecondaryRow } from "@/components/seller/dashboard/secondary-row";
import { SectionHeading } from "@/components/seller/dashboard/section-heading";
import { PageContainer } from "@/components/shared/page-container";
import { SellerShell } from "@/components/seller/shell/seller-shell";
import { StatusChip } from "@/components/shared/status-chip";
import { Surface } from "@/components/shared/surface";
import { Badge } from "@/components/ui/badge";
import { NativeSelect, Select, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import type { DashboardTask } from "@/lib/seller/dashboard-tasks";

/**
 * DEV PREVIEW ONLY — auth-free visual harness.
 *
 * This route exists so the seller workspace's visual layer can be
 * reviewed without a live Supabase session / backend. It renders the
 * real `SellerShell` (dark "Instrument" theme) and the real dashboard
 * components against fixed mock data, so cards, hover lift, shadows
 * and status chips are exercised exactly as the product renders them.
 *
 * It imports ONLY presentation components + the DashboardTask type.
 * It performs no fetch, touches no session and no business API. It is
 * never linked from product navigation.
 */

const now = Date.now();
const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();

const mockTasks: DashboardTask[] = [
  {
    id: "t1",
    type: "return_review",
    priority: "high",
    title: "Ayakkabı iade talebi — numara uyuşmazlığı",
    summary:
      "Müşteri 42 numara yerine 40 geldiğini belirtiyor; değişim ya da iade istiyor.",
    relatedEntityId: 1001,
    entityVersion: 3,
    createdAt: minutesAgo(240),
    updatedAt: minutesAgo(35),
    actionTarget: { kind: "return_issue_request", id: 1001, customerId: 501 },
    customer: { id: 501, name: "Elif Kaya", whatsappNumber: "+90 532 111 22 33" },
  },
  {
    id: "t2",
    type: "order_review",
    priority: "high",
    title: "Sipariş baskı onayı — tasarım çözünürlüğü düşük",
    summary:
      "Yüklenen tasarım dosyasının çözünürlüğü baskı için yetersiz; müşteriye yeni dosya isteği iletildi.",
    relatedEntityId: 2002,
    entityVersion: 1,
    createdAt: minutesAgo(300),
    updatedAt: minutesAgo(90),
    actionTarget: { kind: "order", id: 2002, customerId: 502 },
    customer: { id: 502, name: "Murat Demir", whatsappNumber: "+90 541 555 66 77" },
  },
  {
    id: "t3",
    type: "unanswered_question",
    priority: "normal",
    title: "Kargo ücreti ne kadar?",
    summary: "Asistan bu soruya güvenli cevap veremediği için size bıraktı.",
    relatedEntityId: 3003,
    entityVersion: 2,
    createdAt: minutesAgo(1200),
    updatedAt: minutesAgo(180),
    actionTarget: { kind: "unanswered_question_group", id: 3003, customerId: null },
    customer: null,
  },
  {
    id: "t4",
    type: "unanswered_question",
    priority: "normal",
    title: "İade süresi kaç gün?",
    summary: "Sık gelen bir soru; kayıtlı cevap henüz yok.",
    relatedEntityId: 3004,
    entityVersion: 1,
    createdAt: minutesAgo(3000),
    updatedAt: minutesAgo(720),
    actionTarget: { kind: "unanswered_question_group", id: 3004, customerId: null },
    customer: { id: 503, name: null, whatsappNumber: null },
  },
];

const highTasks = mockTasks.filter((task) => task.priority === "high");
const normalTasks = mockTasks.filter((task) => task.priority === "normal");

export default function PreviewPage() {
  return (
    <SellerShell storeName="Örnek Mağaza">
      <PageContainer className="py-8 sm:py-10">
        {/* Preview notice — honest about the harness, never part of the
            product surface. */}
        <div className="mb-6 flex items-start gap-3 rounded-sheet border-l-[3px] border-l-info bg-info-muted px-4 py-3">
          <p className="type-row-secondary text-foreground">
            <span className="font-semibold">Görsel önizleme.</span>{" "}
            <span className="text-muted">
              Bu sayfa oturum ve backend olmadan, sabit örnek veriyle
              çalışan tasarım önizlemesidir; ürün navigasyonunda yer almaz.
            </span>
          </p>
        </div>

        <DashboardHeader
          total={mockTasks.length}
          high={highTasks.length}
          normal={normalTasks.length}
        />

        {/* High priority — bounded cards that lift on hover. */}
        <section aria-labelledby="preview-high" className="mt-6 space-y-5">
          <SectionHeading
            id="preview-high"
            title="Önce bunlar"
            count={highTasks.length}
            description="İncelemeniz gereken konular."
          />
          <ul role="list" className="space-y-3">
            {highTasks.map((task) => (
              <li
                key={task.id}
                className="work-card overflow-hidden rounded-sheet bg-raised"
              >
                <PriorityCard task={task} />
              </li>
            ))}
          </ul>
        </section>

        {/* Normal priority — quieter cards in two columns on desktop. */}
        <section aria-labelledby="preview-normal" className="mt-10 space-y-5">
          <SectionHeading
            id="preview-normal"
            title="Bugün bakılabilecekler"
            count={normalTasks.length}
            description="Vakit varsa ilerleyebileceğiniz konular."
          />
          <ul
            role="list"
            className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0"
          >
            {normalTasks.map((task) => (
              <li
                key={task.id}
                className="work-card overflow-hidden rounded-sheet bg-raised"
              >
                <CompactTaskCard task={task} />
              </li>
            ))}
          </ul>
        </section>

        {/* Bordered divided sheet — the list treatment that stays a
            single sheet (normal-priority list beside the cards). */}
        <section aria-labelledby="preview-list" className="mt-10 space-y-5">
          <SectionHeading
            id="preview-list"
            title="Yan panel — liste"
            description="Kenarlıklı, bölmeli tek çalışma sayfası."
          />
          <Surface className="overflow-hidden">
            <ul role="list">
              {normalTasks.map((task) => (
                <SecondaryRow key={task.id} task={task} />
              ))}
            </ul>
          </Surface>
        </section>

        {/* Status chips — the full soft-fill tone set. */}
        <section aria-labelledby="preview-chips" className="mt-10 space-y-5">
          <SectionHeading
            id="preview-chips"
            title="Durum rozetleri"
            description="Sadece anlam taşıyan durumlar yumuşak dolgu alır; muted düz metin kalır."
          />
          <Surface className="px-4 py-5 md:px-5">
            <ul className="flex flex-wrap items-center gap-3">
              <li>
                <StatusChip tone="attention">İncelemeniz gerekiyor</StatusChip>
              </li>
              <li>
                <StatusChip tone="success">İlgilenildi</StatusChip>
              </li>
              <li>
                <StatusChip tone="paused">Yanıtlar durduruldu</StatusChip>
              </li>
              <li>
                <StatusChip tone="muted">Asistan bilgi topluyor</StatusChip>
              </li>
            </ul>
          </Surface>
        </section>

        <QuietSummary
          tasks={mockTasks.map((task) => ({ priority: task.priority }))}
          total={mockTasks.length}
          layout="inline"
        />

        {/* ── Yeni UI bileşenleri showcase ─────────────────────── */}

        <section className="space-y-3">
          <SectionHeading
            id="preview-badges"
            title="Badge"
            description="Genel amaçlı durum etiketleri — ton, boyut ve dot desteğiyle."
          />
          <Surface className="px-4 py-5 md:px-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge>Varsayılan</Badge>
              <Badge tone="primary">Birincil</Badge>
              <Badge tone="success">Tamamlandı</Badge>
              <Badge tone="warning">Beklemede</Badge>
              <Badge tone="destructive">Hata</Badge>
              <Badge tone="info">Bilgi</Badge>
              <Badge tone="attention">Dikkat</Badge>
              <Badge tone="paused">Durduruldu</Badge>
              <Badge tone="success" dot>3 yeni</Badge>
              <Badge tone="info" size="lg">Büyük</Badge>
              <Badge tone="warning" size="sm">Küçük</Badge>
            </div>
          </Surface>
        </section>

        <section className="space-y-3">
          <SectionHeading
            id="preview-select"
            title="Select"
            description="Design-token uyumlu dropdown — klavye navigasyonu ve ARIA desteğiyle."
          />
          <Surface className="px-4 py-5 md:px-5">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="type-meta text-muted-foreground">Controlled Select</p>
                <SelectPreview />
              </div>
              <div className="space-y-2">
                <p className="type-meta text-muted-foreground">NativeSelect</p>
                <NativeSelect defaultValue="">
                  <option value="" disabled>Seçin…</option>
                  <option value="a">Seçenek A</option>
                  <option value="b">Seçenek B</option>
                  <option value="c">Seçenek C</option>
                </NativeSelect>
              </div>
            </div>
          </Surface>
        </section>

        <section className="space-y-3">
          <SectionHeading
            id="preview-tabs"
            title="Tabs"
            description="Projenin underline tab diliyle uyumlu sekme bileşeni."
          />
          <Surface className="px-4 py-5 md:px-5">
            <TabsPreview />
          </Surface>
        </section>

        <section className="space-y-3">
          <SectionHeading
            id="preview-tooltip"
            title="Tooltip"
            description="Hover ve focus ile açılan kısa açıklama balonu."
          />
          <Surface className="px-4 py-5 md:px-5">
            <div className="flex flex-wrap items-center gap-6">
              <Tooltip content="Bu bir üst tooltip'tir.">
                <button
                  type="button"
                  className="rounded-control border border-boundary px-3 py-2 type-row-secondary text-foreground hover:bg-elevated"
                >
                  Üstte göster
                </button>
              </Tooltip>
              <Tooltip content="Alt tarafta açılır." side="bottom">
                <button
                  type="button"
                  className="rounded-control border border-boundary px-3 py-2 type-row-secondary text-foreground hover:bg-elevated"
                >
                  Altta göster
                </button>
              </Tooltip>
              <Tooltip content="Sağda açılır." side="right">
                <button
                  type="button"
                  className="rounded-control border border-boundary px-3 py-2 type-row-secondary text-foreground hover:bg-elevated"
                >
                  Sağda göster
                </button>
              </Tooltip>
            </div>
          </Surface>
        </section>

      </PageContainer>
    </SellerShell>
  );
}

/* ── Preview yardımcı bileşenler ──────────────────────────────────────── */

function SelectPreview() {
  const [value, setValue] = React.useState("");
  return (
    <Select value={value} onValueChange={setValue} placeholder="Seçin…">
      <SelectItem value="a">Seçenek A</SelectItem>
      <SelectItem value="b">Seçenek B</SelectItem>
      <SelectItem value="c">Seçenek C — uzun bir metin örneği</SelectItem>
      <SelectItem value="d" disabled>Devre dışı</SelectItem>
    </Select>
  );
}

function TabsPreview() {
  return (
    <Tabs defaultValue="all">
      <TabsList aria-label="Demo sekmeler">
        <TabsTrigger value="all">Tümü</TabsTrigger>
        <TabsTrigger value="active">Aktif</TabsTrigger>
        <TabsTrigger value="done">Tamamlanan</TabsTrigger>
        <TabsTrigger value="disabled" disabled>Devre dışı</TabsTrigger>
      </TabsList>
      <TabsContent value="all">
        <p className="type-row-secondary text-muted-foreground">Tüm öğeler burada görünür.</p>
      </TabsContent>
      <TabsContent value="active">
        <p className="type-row-secondary text-muted-foreground">Yalnızca aktif öğeler görünür.</p>
      </TabsContent>
      <TabsContent value="done">
        <p className="type-row-secondary text-muted-foreground">Tamamlanan öğeler burada.</p>
      </TabsContent>
    </Tabs>
  );
}
