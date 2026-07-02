import React from "react";

const FEED_CATEGORIES = [
  { key: "general", label: "Top" },
  { key: "technology", label: "Technology" },
  { key: "ai", label: "AI" },
  { key: "business", label: "Business" },
  { key: "finance", label: "Finance" },
  { key: "sports", label: "Sports" },
  { key: "entertainment", label: "Entertainment" },
  { key: "politics", label: "Politics" },
  { key: "international", label: "World" },
  { key: "local", label: "India" },
  { key: "science", label: "Science" },
  { key: "health", label: "Health" },
];

const FEED_LANGUAGES = [
  { key: "english", label: "English" },
  { key: "hindi", label: "Hindi" },
  { key: "tamil", label: "Tamil" },
  { key: "telugu", label: "Telugu" },
  { key: "punjabi", label: "Punjabi" },
  { key: "gujarati", label: "Gujarati" },
  { key: "kannada", label: "Kannada" },
  { key: "malayalam", label: "Malayalam" },
  { key: "marathi", label: "Marathi" },
];

function MultiSelect({ label, value, options, onChange }) {
  function toggle(key) {
    console.log(label === "Languages" ? "[LANGUAGE]" : "[FILTER]", { key, selected: !value.includes(key) });
    onChange(value.includes(key) ? value.filter((item) => item !== key) : [...value, key]);
  }
  return (
    <div className="discover-filter-group">
      <div className="discover-filter-label">{label}</div>
      <div className="discover-chip-scroll">
        <button
          className={`discover-chip ${value.length === 0 ? "active" : ""}`}
          type="button"
          onClick={() => {
            console.log(label === "Languages" ? "[LANGUAGE]" : "[FILTER]", { key: "all", selected: true });
            onChange([]);
          }}
        >
          All
        </button>
        {options.map((item) => (
          <button key={item.key} className={`discover-chip ${value.includes(item.key) ? "active" : ""}`} type="button" onClick={() => toggle(item.key)}>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function DiscoverFilters({ filters, meta, onChange, onRefresh, refreshing }) {
  return (
    <div className="discover-filters">
      <div className="discover-filter-row">
        <label className="discover-select-field">
          <span>Date</span>
          <select value={filters.date} onChange={(event) => onChange({ ...filters, date: event.target.value })}>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last-week">Last 7 Days</option>
            <option value="last-month">Last Month</option>
          </select>
        </label>
        <label className="discover-select-field">
          <span>Order</span>
          <select value={filters.sort} onChange={(event) => onChange({ ...filters, sort: event.target.value })}>
            <option value="latest">Latest</option>
            <option value="oldest">Oldest</option>
            <option value="popular">Popular</option>
          </select>
        </label>
        <button className="discover-refresh" type="button" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "Syncing" : "Refresh News"}
        </button>
      </div>
      <MultiSelect label="Languages" value={filters.languages} options={FEED_LANGUAGES} onChange={(languages) => onChange({ ...filters, languages })} />
      <MultiSelect label="Categories" value={filters.categories} options={FEED_CATEGORIES} onChange={(categories) => onChange({ ...filters, categories })} />
    </div>
  );
}
