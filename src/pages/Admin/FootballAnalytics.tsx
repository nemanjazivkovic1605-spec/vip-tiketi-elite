import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Database,
  Download,
  RefreshCw,
  Search,
  Square,
  X,
} from "lucide-react";
import type {
  AnalyticsEnvironment,
  AnalyticsMatch,
  AnalyticsOverview,
  CoverageRow,
  MatchAnalysis,
} from "../../types/footballAnalytics";
import { analyticsRequest } from "../../services/admin/footballAnalyticsService";
import { getDailyAnalysisDates } from "../../utils/dailyDates";
import MatchAnalysisDetail, {
  analyticDate,
} from "../../components/admin/analytics/MatchAnalysisDetail";
import AnalyticsWorkspace from "../../components/admin/analytics/AnalyticsWorkspace";
import AnalyticsMatchTable from "../../components/admin/analytics/AnalyticsMatchTable";

type FixtureSummary = {
  match: AnalyticsMatch;
  reason: string;
  priority: number;
  samples: { home: number; away: number };
};
type FixturePage = {
  matches: FixtureSummary[];
  highlighted: FixtureSummary[];
  hasMore: boolean;
};
const stateNames: Record<CoverageRow["state"], string> = {
  unverified: "Još nije provereno",
  queued: "U redu za uvoz",
  importing: "Uvoz u toku",
  complete: "Uvezeno",
  empty: "Provereno · nema mečeva",
  unavailable: "Nedostupno paketu",
  error: "Prekinuto · nastavivo",
};
const input =
  "min-w-0 rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm text-neutral-100";
const command =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold transition hover:border-gold-500/50 disabled:opacity-40";

export default function FootballAnalytics() {
  const days = getDailyAnalysisDates();
  const [date, setDate] = useState(days[0].date),
    [league, setLeague] = useState(""),
    [search, setSearch] = useState(""),
    [searchInput, setSearchInput] = useState("");
  const [environment, setEnvironment] = useState<AnalyticsEnvironment>("real");
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null),
    [fixtures, setFixtures] = useState<FixturePage | null>(null);
  const [detail, setDetail] = useState<MatchAnalysis | null>(null),
    [selected, setSelected] = useState(""),
    [scope, setScope] = useState<"all" | "league">("all");
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(""),
    [loading, setLoading] = useState(true),
    [detailLoading, setDetailLoading] = useState(false);
  const [coverageLimit, setCoverageLimit] = useState(20),
    [offset, setOffset] = useState(0);
  const runController = useRef<AbortController | null>(null),
    detailRequest = useRef(0);
  const loadOverview = useCallback(
    async (signal?: AbortSignal) =>
      setOverview(
        await analyticsRequest<AnalyticsOverview>(
          "status",
          { environment },
          "GET",
          signal,
        ),
      ),
    [environment],
  );
  useEffect(() => {
    const c = new AbortController();
    setError("");
    void loadOverview(c.signal).catch((e) => {
      if (!c.signal.aborted) setError(e.message);
    });
    return () => c.abort();
  }, [loadOverview]);
  useEffect(() => {
    setOffset(0);
  }, [date, league, search, environment]);
  useEffect(() => {
    if (!overview?.database.ready) {
      setLoading(false);
      return;
    }
    const c = new AbortController();
    setLoading(true);
    setError("");
    void analyticsRequest<FixturePage>(
      "fixtures",
      { date, league, search, environment, offset: String(offset) },
      "GET",
      c.signal,
    )
      .then((value) => {
        if (!c.signal.aborted) setFixtures(value);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [
    date,
    league,
    search,
    environment,
    offset,
    overview?.database.ready,
    message,
  ]);
  useEffect(() => () => runController.current?.abort(), []);
  const openMatch = useCallback(
    async (id: string, newScope: "all" | "league" = scope) => {
      const request = ++detailRequest.current;
      setSelected(id);
      setScope(newScope);
      setDetail(null);
      setDetailLoading(true);
      setError("");
      try {
        const value = await analyticsRequest<MatchAnalysis>("match", {
          id,
          scope: newScope,
        });
        if (request === detailRequest.current) setDetail(value);
      } catch (e) {
        if (request === detailRequest.current)
          setError(e instanceof Error ? e.message : "Analiza nije dostupna.");
      } finally {
        if (request === detailRequest.current) setDetailLoading(false);
      }
    },
    [scope],
  );
  const mutate = async (
    action: "migrate" | "catalog" | "step" | "refresh",
    id?: string,
    repeat = false,
  ) => {
    if (busy) return;
    const c = new AbortController();
    runController.current = c;
    setBusy(action);
    setError("");
    try {
      let processed = 0;
      for (let i = 0; i < (repeat ? 20 : 1); i++) {
        if (c.signal.aborted) break;
        const result = await analyticsRequest<any>(
          action,
          { environment, ...(id ? { id } : {}) },
          "POST",
          c.signal,
        );
        if (result.error) throw new Error(result.error);
        processed += result.processed || 0;
        setMessage(
          action === "catalog"
            ? "Katalog je proveren. Pokrivenost se potvrđuje tek uvozom."
            : action === "migrate"
              ? "Analitička šema je spremna."
              : `Obrađeno u ovoj akciji: ${processed}. Napredak je sačuvan.`,
        );
        if (!repeat || result.busy || (result.done && !id && !result.processed))
          break;
      }
      await loadOverview();
    } catch (e) {
      if (!c.signal.aborted)
        setError(e instanceof Error ? e.message : "Akcija nije uspela.");
    } finally {
      setBusy("");
      runController.current = null;
    }
  };
  const leagues = useMemo(
    () =>
      [
        ...new Map<string, { id: string; name: string }>(
          (overview?.coverage || [])
            .filter((row) => row.environment === environment)
            .map((row) => [
              row.leagueId,
              { id: row.leagueId, name: row.leagueName },
            ]),
        ).values(),
      ].sort((a, b) => a.name.localeCompare(b.name)),
    [overview, environment],
  );
  const coverage = (overview?.coverage || []).filter(
    (row) =>
      row.environment === environment && (!league || row.leagueId === league),
  );
  const highlighted = new Set<string>(fixtures?.highlighted.map((row) => row.match.id) || []);
  return (
    <AnalyticsWorkspace>
      <main className="mx-auto max-w-[1560px] space-y-5 px-3 py-5 sm:px-4 lg:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase text-gold-400">Fudbal · Europe/Belgrade</p>
            <h1 className="text-xl font-bold sm:text-2xl">Dnevni raspored</h1>
            <p className="mt-1 text-xs text-neutral-500">
              Utakmice i dostupni uzorci za izabrani datum.
            </p>
          </div>
          <select
            aria-label="Okruženje podataka"
            className={input}
            value={environment}
            onChange={(e) => {
              setEnvironment(e.target.value as AnalyticsEnvironment);
              setLeague("");
              setFixtures(null);
            }}
          >
            <option value="real">Stvarni podaci</option>
            <option value="test">Odvojeni testni podaci</option>
          </select>
        </div>
        {environment === "test" && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            TESTNI PROSTOR — ovi podaci nisu prava istorija, javna statistika
            niti izvor tiketa.
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200"
          >
            {error}
          </div>
        )}
        {message && (
          <p role="status" className="text-xs text-gold-300">
            {message}
          </p>
        )}
        {overview && !overview.database.configured && (
          <div className="rounded-lg border border-amber-500/25 p-4 text-sm text-amber-200">
            {overview.database.message}
          </div>
        )}
        <details className="border-y border-[#292929] py-3">
        <summary className="cursor-pointer text-xs font-semibold text-neutral-400">Baza, izvori i uvoz</summary>
        <div className="mt-4 flex flex-wrap gap-2">
          {!overview?.database.ready && overview?.database.configured && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void mutate("migrate")}
              className={command}
            >
              <Database size={15} />
              Inicijalizuj analitičku bazu
            </button>
          )}
          <button
            type="button"
            disabled={!!busy || !overview?.database.ready}
            onClick={() => void mutate("catalog")}
            className={command}
          >
            <RefreshCw size={15} />
            Proveri katalog liga
          </button>
          <button
            type="button"
            disabled={!!busy || !coverage.length || !overview?.database.ready}
            onClick={() => void mutate("step", undefined, true)}
            className={`${command} border-gold-500/30 text-gold-300`}
          >
            <Download size={15} />
            {busy === "step" ? "Uvoz u toku…" : "Uvezi / nastavi 20 serija"}
          </button>
          {busy && (
            <button
              type="button"
              className={command}
              onClick={() => runController.current?.abort()}
            >
              <Square size={14} />
              Zaustavi posle trenutne serije
            </button>
          )}
        </div>
        {overview?.database.ready && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ["Uvezene lige", overview.totals.leagues],
              ["Utakmice", overview.totals.matches],
              ["Završene · FT", overview.totals.finished],
              ["Poznat HT i FT", overview.totals.withHt],
              ["xG obe ekipe", overview.totals.withXg],
            ].map(([label, value]) => (
              <div key={label} className="border-b border-white/10 py-3">
                <span className="text-[11px] text-neutral-500">{label}</span>
                <strong className="mt-1 block text-xl tabular-nums">
                  {value}
                </strong>
              </div>
            ))}
          </div>
        )}
        {!!overview?.providers.length && (
          <details className="border-b border-white/10 pb-3">
            <summary className="cursor-pointer text-xs text-neutral-400">
              Izvori i stanje pristupa
            </summary>
            <div className="mt-3 space-y-2">
              {overview.providers.map((provider) => (
                <p
                  className="text-xs leading-5 text-neutral-400"
                  key={provider.id}
                >
                  <strong className="text-neutral-200">{provider.id}</strong>
                  {provider.environment === "test"
                    ? " · testni ključ"
                    : ""} — {provider.message}
                </p>
              ))}
              <p className="text-xs text-neutral-500">
                Championship, League One i League Two potvrđuju se u katalogu i
                uvozu; dostupnost xG se meri zasebno.
              </p>
              <p className="text-[11px] text-neutral-500">
                Data provided by football-data.org · OpenLigaDB (ODbL) ·
                PitchAPI
              </p>
            </div>
          </details>
        )}
        </details>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput);
          }}
          className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
        >
          {days.slice(0, 2).map((day) => (
            <button
              type="button"
              key={day.key}
              onClick={() => setDate(day.date)}
              className={`${command} ${date === day.date ? "border-gold-500 text-gold-300" : ""}`}
            >
              {day.label}
            </button>
          ))}
          <input
            type="date"
            aria-label="Datum utakmica"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={input}
          />
          <select
            aria-label="Liga"
            value={league}
            onChange={(e) => setLeague(e.target.value)}
            className={`${input} col-span-2 max-w-full sm:col-span-1`}
          >
            <option value="">Sve lige</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <input
            aria-label="Pretraga kluba"
            placeholder="Pretraga kluba"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={`${input} col-span-2 flex-1 sm:col-span-1`}
          />
          <button
            type="submit"
            aria-label="Pretraži utakmice"
            className={command}
          >
            <Search size={17} />
          </button>
        </form>
        <section>
          <div className="mb-3 flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays size={15} className="text-neutral-500" />{date.split('-').reverse().join('.')}</h2><span className="text-[11px] text-neutral-500">{fixtures?.matches.length || 0} utakmica u pregledu</span></div>
          {loading && <p role="status" className="mb-3 text-xs text-neutral-500">Učitavanje iz baze…</p>}
          <AnalyticsMatchTable matches={fixtures?.matches.map(row => row.match) || []} onOpen={match => void openMatch(match.id)} actionLabel="Analiza" highlighted={highlighted} notes={new Map(fixtures?.matches.map(row => [row.match.id, `${row.reason} · prethodni uzorak ${row.samples.home}/${row.samples.away}`]))} />
          {!loading && !fixtures?.matches.length && (
            <div className="border-b border-[#292929] py-12 text-center"><CalendarDays size={26} className="mx-auto mb-3 text-neutral-600" /><h3 className="text-sm font-semibold">Nema sačuvanih utakmica za ovaj datum</h3><p className="mt-1 text-xs text-neutral-500">Istorijski rezultati dostupni su u posebnom pregledu.</p><Link to="/admin/historical-analytics" className={`${command} mt-4`}>Rezultati i H2H</Link></div>
          )}
          <div className="mt-3 flex gap-2">
            {offset > 0 && (
              <button
                type="button"
                className={command}
                onClick={() => setOffset(Math.max(0, offset - 50))}
              >
                Prethodnih 50
              </button>
            )}
            {fixtures?.hasMore && (
              <button
                type="button"
                className={command}
                onClick={() => setOffset(offset + 50)}
              >
                Sledećih 50
              </button>
            )}
          </div>
        </section>
        <details className="border-t border-white/10 pt-4">
          <summary className="cursor-pointer text-xs font-semibold text-neutral-400">Pokrivenost po ligi i sezoni</summary>
          <p className="mt-1 text-xs text-neutral-500">
            Nedostajući podaci ostaju null. „Još nije provereno” ne znači da
            izvor nema podatke.
          </p>
          <div className="mt-3 divide-y divide-white/10">
            {coverage.slice(0, coverageLimit).map((row) => (
              <div
                key={row.id}
                className="grid gap-3 py-3 md:grid-cols-[2fr_2fr_1fr_auto]"
              >
                <div className="text-sm font-semibold">
                  {row.leagueName}
                  <span className="mt-1 block text-xs font-normal text-neutral-500">
                    {row.season} · {row.provider} · {row.country}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <span>
                    FT<strong className="block">{row.finished}</strong>
                  </span>
                  <span>
                    HT + FT<strong className="block">{row.withHt}</strong>
                  </span>
                  <span>
                    xG obe
                    <strong className="block">
                      {row.state === "unverified" ? "—" : row.withXg}
                    </strong>
                    <small className="text-neutral-500">
                      {row.provider !== "pitchapi"
                        ? "nije ponuđen"
                        : `provereno ${row.statsChecked}`}
                    </small>
                  </span>
                </div>
                <div className="text-xs text-neutral-400">
                  {stateNames[row.state]}
                  <span className="mt-1 block text-[10px]">
                    {row.cursor}/{row.total} ·{" "}
                    {row.lastSyncedAt
                      ? analyticDate(row.lastSyncedAt)
                      : "Bez sinhronizacije"}
                  </span>
                  {row.error && (
                    <span className="mt-1 block text-red-300">{row.error}</span>
                  )}
                </div>
                <div className="flex gap-2 self-start">
                  <button
                    type="button"
                    className={command}
                    disabled={!!busy}
                    title="Uvezi ili nastavi ovu seriju"
                    onClick={() => void mutate("step", row.id)}
                  >
                    <Download size={15} />
                  </button>
                  <button
                    type="button"
                    className={command}
                    disabled={!!busy}
                    title="Ponovo proveri raspored i naknadne ispravke"
                    onClick={() => void mutate("refresh", row.id)}
                  >
                    <RefreshCw size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {coverage.length > coverageLimit && (
            <button
              type="button"
              onClick={() => setCoverageLimit((n) => n + 30)}
              className={`${command} mt-3`}
            >
              Prikaži još liga i sezona
            </button>
          )}
        </details>
      </main>
      {(detail || detailLoading) && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 md:p-6"
          onClick={() => {
            ++detailRequest.current;
            setDetail(null);
            setDetailLoading(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Analiza utakmice"
            className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-white/15 bg-[#101010] p-4 md:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="mb-3 ml-auto flex p-1 text-neutral-400"
              aria-label="Zatvori analizu"
              onClick={() => {
                ++detailRequest.current;
                setDetail(null);
                setDetailLoading(false);
              }}
            >
              <X size={20} />
            </button>
            {detailLoading ? (
              <p className="py-12 text-center text-sm text-neutral-400">
                Proračun iz sačuvanih podataka…
              </p>
            ) : (
              detail && (
                <MatchAnalysisDetail
                  analysis={detail}
                  onScope={(value) => void openMatch(selected, value)}
                  onOpen={(id) => void openMatch(id)}
                />
              )
            )}
          </div>
        </div>
      )}
    </AnalyticsWorkspace>
  );
}
