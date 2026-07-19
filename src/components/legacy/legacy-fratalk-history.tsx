"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Loader2, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  LegacyBalanceRow,
  LegacyEtiquetaRow,
  LegacyRespuestaRow,
  LegacySendRow,
} from "@/lib/fratalk/legacy-types";

const PAGE_SIZE = 10;

type ReplyFilter = "all" | "replied" | "unreplied";

interface SendsResponse {
  configured?: boolean;
  has_ruc?: boolean;
  ruc?: string;
  rows: LegacySendRow[];
  total: number;
  error?: string;
  code?: string;
}

interface DetailResponse {
  send: LegacySendRow;
  etiquetas: LegacyEtiquetaRow[];
  respuestas: LegacyRespuestaRow[];
  error?: string;
}

interface BalanceResponse {
  has_ruc?: boolean;
  rows: LegacyBalanceRow[];
  error?: string;
  code?: string;
}

export interface LegacyFratalkHistoryProps {
  /** Base path without trailing slash, e.g. /api/account/legacy-fratalk */
  apiBase: string;
  /** Show vista_saldo_compras tab — platform owner only */
  showBalance?: boolean;
  /** Optional panel title (settings uses SettingsPanelHead outside) */
  compact?: boolean;
}

export function LegacyFratalkHistory({
  apiBase,
  showBalance = false,
  compact = false,
}: LegacyFratalkHistoryProps) {
  const t = useTranslations("LegacyFratalk");
  const [tab, setTab] = useState("sends");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [replyFilter, setReplyFilter] = useState<ReplyFilter>("all");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SendsResponse | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<DetailResponse | null>(null);

  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balance, setBalance] = useState<LegacyBalanceRow[] | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setQDebounced(q.trim()), 300);
    return () => window.clearTimeout(id);
  }, [q]);

  useEffect(() => {
    setOffset(0);
  }, [qDebounced, replyFilter]);

  const loadSends = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (qDebounced) params.set("q", qDebounced);
      if (replyFilter !== "all") params.set("replied", replyFilter);
      const res = await fetch(`${apiBase}/sends?${params}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as SendsResponse;
      if (!res.ok) {
        throw new Error(
          json.error ||
            (json.code === "not_configured"
              ? t("mysqlNotConfigured")
              : t("loadError")),
        );
      }
      setData(json);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [apiBase, offset, qDebounced, replyFilter, t]);

  useEffect(() => {
    void loadSends();
  }, [loadSends]);

  const loadBalance = useCallback(async () => {
    if (!showBalance) return;
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const res = await fetch(`${apiBase}/balance`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as BalanceResponse;
      if (!res.ok) {
        throw new Error(
          json.error ||
            (json.code === "not_configured"
              ? t("mysqlNotConfigured")
              : t("loadError")),
        );
      }
      setBalance(json.rows ?? []);
    } catch (err) {
      setBalance(null);
      setBalanceError(err instanceof Error ? err.message : t("loadError"));
    } finally {
      setBalanceLoading(false);
    }
  }, [apiBase, showBalance, t]);

  useEffect(() => {
    if (showBalance && tab === "balance") {
      void loadBalance();
    }
  }, [showBalance, tab, loadBalance]);

  async function openDetail(mensajeId: number) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`${apiBase}/sends/${mensajeId}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as DetailResponse;
      if (!res.ok) {
        throw new Error(json.error || t("detailError"));
      }
      setDetail(json);
    } catch (err) {
      setDetail(null);
      setError(err instanceof Error ? err.message : t("detailError"));
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  const total = data?.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const replyFilterItems = [
    { value: "all", label: t("replyFilterAll") },
    { value: "replied", label: t("replyFilterReplied") },
    { value: "unreplied", label: t("replyFilterUnreplied") },
  ];

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {!compact ? (
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="sends">{t("tabSends")}</TabsTrigger>
          {showBalance ? (
            <TabsTrigger value="balance">{t("tabBalance")}</TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="sends" className="space-y-3 pt-3">
          {data && data.has_ruc === false ? (
            <p className="text-sm text-muted-foreground">{t("noRuc")}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder={t("searchPlaceholder")}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
                <Select
                  value={replyFilter}
                  onValueChange={(value) => {
                    if (
                      value === "all" ||
                      value === "replied" ||
                      value === "unreplied"
                    ) {
                      setReplyFilter(value);
                    }
                  }}
                  items={replyFilterItems}
                >
                  <SelectTrigger
                    className="w-[220px]"
                    aria-label={t("replyFilterLabel")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {replyFilterItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t("totalLabel", { count: total })}
                </p>
              </div>

              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}

              {loading && !data ? (
                <div className="flex h-28 items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="rounded-xl ring-1 ring-foreground/10">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("colDate")}</TableHead>
                        <TableHead>{t("colPhone")}</TableHead>
                        <TableHead>{t("colTemplate")}</TableHead>
                        <TableHead>{t("colStatus")}</TableHead>
                        <TableHead className="hidden md:table-cell">
                          {t("colWamid")}
                        </TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data?.rows ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="py-8 text-center text-muted-foreground"
                          >
                            {t("emptySends")}
                          </TableCell>
                        </TableRow>
                      ) : (
                        (data?.rows ?? []).map((row) => (
                          <TableRow key={row.mensaje_id}>
                            <TableCell className="whitespace-nowrap text-xs">
                              {row.fh_envio}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {row.telefono_recepcion}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {row.template_name || row.template_id}
                              </div>
                              {row.template_name ? (
                                <div className="font-mono text-[10px] text-muted-foreground">
                                  {row.template_id}
                                </div>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              {row.has_inbound_reply ? (
                                <Badge variant="default">
                                  {t("tagReplied")}
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-muted-foreground"
                                >
                                  {t("tagNoReply")}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="hidden max-w-[160px] truncate font-mono text-[10px] text-muted-foreground md:table-cell">
                              {row.message_id || t("emDash")}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                onClick={() => openDetail(row.mensaje_id)}
                                aria-label={t("viewDetail")}
                              >
                                <Eye className="size-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              {total > PAGE_SIZE ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {t("pageLabel", { page, pageCount })}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={offset <= 0 || loading}
                      onClick={() =>
                        setOffset((o) => Math.max(0, o - PAGE_SIZE))
                      }
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={offset + PAGE_SIZE >= total || loading}
                      onClick={() => setOffset((o) => o + PAGE_SIZE)}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </TabsContent>

        {showBalance ? (
          <TabsContent value="balance" className="space-y-3 pt-3">
            {balanceError ? (
              <p className="text-sm text-destructive">{balanceError}</p>
            ) : null}
            {balanceLoading && !balance ? (
              <div className="flex h-28 items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="rounded-xl ring-1 ring-foreground/10">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colPurchase")}</TableHead>
                      <TableHead>{t("colStart")}</TableHead>
                      <TableHead>{t("colCategory")}</TableHead>
                      <TableHead className="text-right">{t("colUsed")}</TableHead>
                      <TableHead className="text-right">
                        {t("colRemaining")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("colPct")}
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">
                        {t("colLastSend")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(balance ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="py-8 text-center text-muted-foreground"
                        >
                          {t("emptyBalance")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      (balance ?? []).map((row, i) => (
                        <TableRow key={`${row.id}-${row.category}-${i}`}>
                          <TableCell className="font-mono text-xs">
                            #{row.id}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {row.inicio_vigencia}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{row.category}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.usado.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.saldo.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.porcentaje_consumo}%
                          </TableCell>
                          <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
                            {row.ultimo_envio || t("emDash")}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        ) : null}
      </Tabs>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("detailTitle")}</DialogTitle>
            <DialogDescription>{t("detailDescription")}</DialogDescription>
          </DialogHeader>
          {detailLoading || !detail ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">{t("colDate")}</dt>
                  <dd>{detail.send.fh_envio}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("colPhone")}</dt>
                  <dd className="font-mono">{detail.send.telefono_recepcion}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">{t("colTemplate")}</dt>
                  <dd>
                    {detail.send.template_name || detail.send.template_id}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">{t("colWamid")}</dt>
                  <dd className="break-all font-mono text-xs">
                    {detail.send.message_id || t("emDash")}
                  </dd>
                </div>
              </dl>

              <div>
                <h3 className="mb-2 font-medium">{t("variablesTitle")}</h3>
                {detail.etiquetas.length === 0 ? (
                  <p className="text-muted-foreground">{t("noVariables")}</p>
                ) : (
                  <ul className="space-y-1 rounded-lg bg-muted/40 p-3">
                    {detail.etiquetas.map((e) => (
                      <li key={e.id} className="flex gap-2 font-mono text-xs">
                        <span className="text-muted-foreground">
                          [{e.orden_template}]
                        </span>
                        <span>{e.valor}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="mb-2 font-medium">{t("repliesTitle")}</h3>
                {detail.respuestas.length === 0 ? (
                  <p className="text-muted-foreground">{t("noReplies")}</p>
                ) : (
                  <ul className="space-y-2">
                    {detail.respuestas.map((r) => (
                      <li
                        key={`${r.kind}-${r.id}`}
                        className="rounded-lg border border-border p-3"
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              r.kind === "automatic" ? "secondary" : "default"
                            }
                          >
                            {r.kind === "automatic"
                              ? t("kindAutomatic")
                              : t("kindInbound")}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {r.fh_envio}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm">{r.mensaje}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
