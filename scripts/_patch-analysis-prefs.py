from pathlib import Path

p = Path("src/domains/analysis/ui/AnalysisDashboard.tsx")
text = p.read_text(encoding="utf-8")

anchor = 'import { fetchAnalysis } from "@/domains/analysis/queries/fetchAnalysis";'
import_block = '''import { fetchAnalysis } from "@/domains/analysis/queries/fetchAnalysis";
import {
  DEFAULT_ANALYSIS_UI_PREFS,
  readAnalysisUiPrefs,
  writeAnalysisUiPrefs,
  type AnalysisTab,
  type FacetPane,
} from "@/domains/analysis/ui/analysisUiPrefs";'''
if anchor not in text:
    raise SystemExit("fetchAnalysis import not found")
if "analysisUiPrefs" not in text:
    text = text.replace(anchor, import_block, 1)

old_tab_type = '''type AnalysisTab =
  | "main"
  | "sections"
  | "spreads"
  | "categories"
  | "subcategories"
  | "tags"
  | "types"
  | "merchants"
  | "patterns";

'''
if old_tab_type not in text:
    raise SystemExit("AnalysisTab type not found")
text = text.replace(old_tab_type, "", 1)

old_pane_type = '''type FacetPane = "visualizations" | "summary" | "average" | "range";

'''
if old_pane_type not in text:
    raise SystemExit("FacetPane type not found")
text = text.replace(old_pane_type, "", 1)

tabs = [
    (
        "SectionsTab",
        '''function SectionsTab({
  data,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const [pane, setPane] = useState<FacetPane>("visualizations");''',
        '''function SectionsTab({
  data,
  period,
  onPeriodChange,
  pane,
  onPaneChange,
}: {
  data: AnalysisData;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
  pane: FacetPane;
  onPaneChange: (value: FacetPane) => void;
}) {''',
    ),
    (
        "SpreadsTab",
        '''function SpreadsTab({
  data,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const [pane, setPane] = useState<FacetPane>("visualizations");''',
        '''function SpreadsTab({
  data,
  period,
  onPeriodChange,
  pane,
  onPaneChange,
}: {
  data: AnalysisData;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
  pane: FacetPane;
  onPaneChange: (value: FacetPane) => void;
}) {''',
    ),
    (
        "CategoriesTab",
        '''function CategoriesTab({
  data,
  category,
  onSelectCategory,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  category: string;
  onSelectCategory: (name: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const [pane, setPane] = useState<FacetPane>("visualizations");''',
        '''function CategoriesTab({
  data,
  category,
  onSelectCategory,
  period,
  onPeriodChange,
  pane,
  onPaneChange,
}: {
  data: AnalysisData;
  category: string;
  onSelectCategory: (name: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
  pane: FacetPane;
  onPaneChange: (value: FacetPane) => void;
}) {''',
    ),
    (
        "SubcategoriesTab",
        '''function SubcategoriesTab({
  data,
  subcategory,
  onSelectSubcategory,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  subcategory: string;
  onSelectSubcategory: (name: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const [pane, setPane] = useState<FacetPane>("visualizations");''',
        '''function SubcategoriesTab({
  data,
  subcategory,
  onSelectSubcategory,
  period,
  onPeriodChange,
  pane,
  onPaneChange,
}: {
  data: AnalysisData;
  subcategory: string;
  onSelectSubcategory: (name: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
  pane: FacetPane;
  onPaneChange: (value: FacetPane) => void;
}) {''',
    ),
    (
        "TagsTab",
        '''function TagsTab({
  data,
  tag,
  onSelectTag,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  tag: string;
  onSelectTag: (name: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const [pane, setPane] = useState<FacetPane>("visualizations");''',
        '''function TagsTab({
  data,
  tag,
  onSelectTag,
  period,
  onPeriodChange,
  pane,
  onPaneChange,
}: {
  data: AnalysisData;
  tag: string;
  onSelectTag: (name: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
  pane: FacetPane;
  onPaneChange: (value: FacetPane) => void;
}) {''',
    ),
    (
        "TypesTab",
        '''function TypesTab({
  data,
  type,
  onSelectType,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  type: string;
  onSelectType: (name: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const [pane, setPane] = useState<FacetPane>("visualizations");''',
        '''function TypesTab({
  data,
  type,
  onSelectType,
  period,
  onPeriodChange,
  pane,
  onPaneChange,
}: {
  data: AnalysisData;
  type: string;
  onSelectType: (name: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
  pane: FacetPane;
  onPaneChange: (value: FacetPane) => void;
}) {''',
    ),
    (
        "MerchantsTab",
        '''function MerchantsTab({
  data,
  merchant,
  onSelectMerchant,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  merchant: string;
  onSelectMerchant: (name: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const [pane, setPane] = useState<FacetPane>("visualizations");''',
        '''function MerchantsTab({
  data,
  merchant,
  onSelectMerchant,
  period,
  onPeriodChange,
  pane,
  onPaneChange,
}: {
  data: AnalysisData;
  merchant: string;
  onSelectMerchant: (name: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
  pane: FacetPane;
  onPaneChange: (value: FacetPane) => void;
}) {''',
    ),
]

for name, old, new in tabs:
    if old not in text:
        raise SystemExit(f"{name} signature not found")
    text = text.replace(old, new, 1)

text = text.replace("onPaneChange={setPane}", "onPaneChange={onPaneChange}")

old_dash = '''export function AnalysisDashboard() {
  const [range, setRange] = useState<AnalysisRange>("12m");
  const [period, setPeriod] = useState<AnalysisPeriod>("monthly");
  const [tab, setTab] = useState<AnalysisTab>("main");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [tag, setTag] = useState("");
  const [type, setType] = useState("");
  const [merchant, setMerchant] = useState("");
  const query = useAnalysis(range, period);
  const data = query.data;
'''

new_dash = '''export function AnalysisDashboard() {
  const [range, setRange] = useState<AnalysisRange>(
    DEFAULT_ANALYSIS_UI_PREFS.range,
  );
  const [period, setPeriod] = useState<AnalysisPeriod>(
    DEFAULT_ANALYSIS_UI_PREFS.period,
  );
  const [tab, setTab] = useState<AnalysisTab>(DEFAULT_ANALYSIS_UI_PREFS.tab);
  const [pane, setPane] = useState<FacetPane>(DEFAULT_ANALYSIS_UI_PREFS.pane);
  const [category, setCategory] = useState(DEFAULT_ANALYSIS_UI_PREFS.category);
  const [subcategory, setSubcategory] = useState(
    DEFAULT_ANALYSIS_UI_PREFS.subcategory,
  );
  const [tag, setTag] = useState(DEFAULT_ANALYSIS_UI_PREFS.tag);
  const [type, setType] = useState(DEFAULT_ANALYSIS_UI_PREFS.type);
  const [merchant, setMerchant] = useState(DEFAULT_ANALYSIS_UI_PREFS.merchant);
  const [prefsReady, setPrefsReady] = useState(false);
  const query = useAnalysis(range, period);
  const data = query.data;

  useEffect(() => {
    const prefs = readAnalysisUiPrefs();
    setRange(prefs.range);
    setPeriod(prefs.period);
    setTab(prefs.tab);
    setPane(prefs.pane);
    setCategory(prefs.category);
    setSubcategory(prefs.subcategory);
    setTag(prefs.tag);
    setType(prefs.type);
    setMerchant(prefs.merchant);
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    writeAnalysisUiPrefs({
      range,
      period,
      tab,
      pane,
      category,
      subcategory,
      tag,
      type,
      merchant,
    });
  }, [
    prefsReady,
    range,
    period,
    tab,
    pane,
    category,
    subcategory,
    tag,
    type,
    merchant,
  ]);
'''

if old_dash not in text:
    raise SystemExit("AnalysisDashboard state block not found")
text = text.replace(old_dash, new_dash, 1)

replacements = [
    (
        '''              {tab === "sections" ? (
                <SectionsTab
                  data={data}
                  period={period}
                  onPeriodChange={setPeriod}
                />
              ) : null}''',
        '''              {tab === "sections" ? (
                <SectionsTab
                  data={data}
                  period={period}
                  onPeriodChange={setPeriod}
                  pane={pane}
                  onPaneChange={setPane}
                />
              ) : null}''',
    ),
    (
        '''              {tab === "spreads" ? (
                <SpreadsTab
                  data={data}
                  period={period}
                  onPeriodChange={setPeriod}
                />
              ) : null}''',
        '''              {tab === "spreads" ? (
                <SpreadsTab
                  data={data}
                  period={period}
                  onPeriodChange={setPeriod}
                  pane={pane}
                  onPaneChange={setPane}
                />
              ) : null}''',
    ),
    (
        '''              {tab === "categories" ? (
                <CategoriesTab
                  data={data}
                  category={category}
                  onSelectCategory={setCategory}
                  period={period}
                  onPeriodChange={setPeriod}
                />
              ) : null}''',
        '''              {tab === "categories" ? (
                <CategoriesTab
                  data={data}
                  category={category}
                  onSelectCategory={setCategory}
                  period={period}
                  onPeriodChange={setPeriod}
                  pane={pane}
                  onPaneChange={setPane}
                />
              ) : null}''',
    ),
    (
        '''              {tab === "subcategories" ? (
                <SubcategoriesTab
                  data={data}
                  subcategory={subcategory}
                  onSelectSubcategory={setSubcategory}
                  period={period}
                  onPeriodChange={setPeriod}
                />
              ) : null}''',
        '''              {tab === "subcategories" ? (
                <SubcategoriesTab
                  data={data}
                  subcategory={subcategory}
                  onSelectSubcategory={setSubcategory}
                  period={period}
                  onPeriodChange={setPeriod}
                  pane={pane}
                  onPaneChange={setPane}
                />
              ) : null}''',
    ),
    (
        '''              {tab === "tags" ? (
                <TagsTab
                  data={data}
                  tag={tag}
                  onSelectTag={setTag}
                  period={period}
                  onPeriodChange={setPeriod}
                />
              ) : null}''',
        '''              {tab === "tags" ? (
                <TagsTab
                  data={data}
                  tag={tag}
                  onSelectTag={setTag}
                  period={period}
                  onPeriodChange={setPeriod}
                  pane={pane}
                  onPaneChange={setPane}
                />
              ) : null}''',
    ),
    (
        '''              {tab === "types" ? (
                <TypesTab
                  data={data}
                  type={type}
                  onSelectType={setType}
                  period={period}
                  onPeriodChange={setPeriod}
                />
              ) : null}''',
        '''              {tab === "types" ? (
                <TypesTab
                  data={data}
                  type={type}
                  onSelectType={setType}
                  period={period}
                  onPeriodChange={setPeriod}
                  pane={pane}
                  onPaneChange={setPane}
                />
              ) : null}''',
    ),
    (
        '''              {tab === "merchants" ? (
                <MerchantsTab
                  data={data}
                  merchant={merchant}
                  onSelectMerchant={setMerchant}
                  period={period}
                  onPeriodChange={setPeriod}
                />
              ) : null}''',
        '''              {tab === "merchants" ? (
                <MerchantsTab
                  data={data}
                  merchant={merchant}
                  onSelectMerchant={setMerchant}
                  period={period}
                  onPeriodChange={setPeriod}
                  pane={pane}
                  onPaneChange={setPane}
                />
              ) : null}''',
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit("call site not found:\n" + old[:120])
    text = text.replace(old, new, 1)

p.write_text(text, encoding="utf-8", newline="\n")
print("ok")
print("onPaneChange={onPaneChange}", text.count("onPaneChange={onPaneChange}"))
print("onPaneChange={setPane}", text.count("onPaneChange={setPane}"))
print("useState<FacetPane>", text.count('useState<FacetPane>'))
