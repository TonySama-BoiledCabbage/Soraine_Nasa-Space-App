//! Port of the markup functions in `dist/app.mjs`. Each returns the same HTML
//! string as its JavaScript counterpart; the browser crate puts it on the page.
use crate::data::{comparison_rows, esc, number, Row, MATERIALS};
use crate::glossary::term;
pub use crate::app_data::{WorldInfo, ICON_PATHS, WORLD_INFO};
use serde_json::Value;

pub fn world_info(world: &str) -> Option<&'static WorldInfo> { WORLD_INFO.iter().find(|info| info.world == world) }

/// JavaScript's default number-to-string for the magnitudes used in markup.
fn js_number(value: f64) -> String { if value.is_nan() { "NaN".to_string() } else { format!("{value}") } }

pub fn icon(name: &str) -> String {
    let path = ICON_PATHS.iter().find(|entry| entry.0 == name).or_else(|| ICON_PATHS.iter().find(|entry| entry.0 == "orbit")).map_or("", |entry| entry.1);
    format!("<svg class=\"icon\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"{path}\"/></svg>")
}

/// Escaped text with the polymer abbreviations turned into glossary terms.
pub fn sample_text(value: &str) -> String {
    let (escaped, mut out, mut i) = (esc(value), String::new(), 0);
    let bytes = escaped.as_bytes();
    let word = |b: u8| b.is_ascii_alphanumeric() || b == b'_';
    'scan: while i < bytes.len() {
        if i == 0 || !word(bytes[i - 1]) {
            for key in ["PEI", "PET", "PMMA"] {
                let end = i + key.len();
                if escaped[i..].starts_with(key) && bytes.get(end).is_none_or(|b| !word(*b)) {
                    out.push_str(&term(key, key, false));
                    i = end;
                    continue 'scan;
                }
            }
        }
        let next = escaped[i..].chars().next().map_or(1, char::len_utf8);
        out.push_str(&escaped[i..i + next]);
        i += next;
    }
    out
}

pub fn material_description(material: &str) -> &'static str {
    match material {
        "Ultem 1000" => "Polyetherimide (PEI), tested here as a thin polymer film.",
        "Mylar G" => "Polyethylene terephthalate (PET), a polyester film.",
        "Nomex HT90-40" => "An aramid fabric, tested here as a thin woven specimen.",
        _ => "",
    }
}

fn labelled(key: Option<&str>, label: &str) -> String { key.map_or_else(|| esc(label), |key| term(key, label, false)) }

pub fn unit_label(value: &str) -> String {
    labelled(match value { "O2 molar percent" => Some("oxygen"), "O2 percentage points" => Some("pp"), "cm/s" => Some("cmps"), _ => None }, value)
}

pub fn evidence_label(row: &Row) -> String {
    labelled(match row.evidence_type() {
        "reported_experimental_limit_aggregate" => Some("published"),
        "reported_fit_to_experimental_data" => Some("fitted"),
        "reported_experimental_summary" => Some("summary"),
        "source_derived_from_limit_aggregates" => Some("derived"),
        "model_derived_compensation_from_experiments" => Some("model"),
        _ => None,
    }, &row.kind.name)
}

pub fn field_label(label: &str) -> String {
    labelled(match label { "Test pressure" => Some("kPa"), "Oxygen" => Some("oxygen"), "Airflow" => Some("airflow"), _ => None }, label)
}

/// The material picker; `selected` is the material in focus.
pub fn material_panel(rows: &[Row], selected: &str) -> String {
    let buttons: String = MATERIALS.iter().zip(["polymer", "film", "fabric"]).map(|(material, mark)| {
        let active = *material == selected;
        format!("<button data-material=\"{0}\" class=\"{1}\" aria-pressed=\"{active}\"><span class=\"sample-mark\">{2}</span>{0}<span class=\"count\">{3}</span></button>",
            esc(material), if active { "active" } else { "" }, icon(mark), rows.iter().filter(|r| r.material() == Some(material)).count())
    }).collect();
    format!("<section class=\"panel material-panel\"><div class=\"panel-head\">Oxygen-limit comparison<span class=\"tiny\">2012 study</span></div><div class=\"material-list\">{buttons}</div><button class=\"material-library-link text-link\" data-browse-materials=\"true\">Browse all reported materials {}</button></section>", icon("arrow"))
}

/// The four-gravity oxygen-limit chart for `material`, with `world` highlighted.
pub fn chart(rows: &[Row], material: &str, world: &str, large: bool) -> String {
    let scale: String = [0, 10, 20, 30].iter().map(|n| format!("<span>{n}</span>")).collect();
    let ticks: String = (0..4).map(|n| format!("<i class=\"limit-tick\" style=\"left:{}%\"></i>", js_number(f64::from(n) / 3.0 * 100.0))).collect();
    let entries: String = comparison_rows(rows, material).into_iter().map(|(entry_world, limits)| {
        let record = [limits.uloi, limits.moc].into_iter().flatten().map(|r| r.get("measurement_id")).find(|id| !id.is_empty()).unwrap_or_default();
        let points: String = [(limits.uloi, "uloi"), (limits.moc, "moc")].into_iter().filter_map(|(row, kind)| {
            let left = row?.value() / 30.0 * 100.0;
            Some(format!("<i class=\"limit-point {kind}\" style=\"left:{}%\"></i>", js_number(if left.is_nan() { left } else { left.clamp(0.0, 100.0) })))
        }).collect();
        let reading = |row: Option<&Row>| row.map_or("—".to_string(), |r| number(r.field("value"), 1));
        format!("<button class=\"limit-row {selected}\" data-record=\"{record}\" aria-label=\"Open {entry_world} {material} oxygen-limit source\">\n <span class=\"limit-world\"><i class=\"world-glyph world-{glyph}\" aria-hidden=\"true\"></i><span>{name}<small>{pressure} kPa</small></span></span>\n <span class=\"limit-track\" aria-hidden=\"true\">{ticks}{points}</span>\n <span class=\"limit-number uloi\">{uloi}<small>%</small></span><span class=\"limit-number moc\">{moc}<small>%</small></span>\n </button>",
            selected = if entry_world == world { "selected" } else { "" }, record = esc(&record), glyph = entry_world.to_lowercase(),
            name = if entry_world == "Microgravity" { "Micro-g" } else { entry_world },
            pressure = number(limits.uloi.and_then(|r| r.experiment_field("pressure_kpa")), 1), uloi = reading(limits.uloi), moc = reading(limits.moc))
    }).collect();
    format!("<div class=\"limit-chart {}\" aria-label=\"Published oxygen limits for {}. Separate experimental observations.\">\n <div class=\"limit-chart-head\"><span>Gravity / pressure</span><div class=\"limit-scale\">{scale}</div><span>{}</span><span>{}</span></div>\n {entries}<div class=\"limit-chart-foot\"><span>Oxygen concentration (%) · each point is a reported limit</span><span>Tap a row for its source ↗</span></div></div>",
        if large { "limit-chart-large" } else { "" }, esc(material), term("ULOI", "ULOI / *", false), term("MOC", "MOC / *", false))
}

/// `Value` text helper for callers that hold raw records.
pub fn text_of(value: Option<&Value>) -> String { crate::data::text(value) }
