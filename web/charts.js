// charts.js — themed ECharts wrappers

const PALETTE = ['#4A9EFF', '#7C5CFF', '#3FB68B', '#E8A23B', '#E5484D', '#5BCEDA', '#F472B6'];

const BASE = {
  textStyle: { color: '#E6EDF3', fontFamily: 'Inter' },
  color: PALETTE,
  grid: { left: 36, right: 12, top: 24, bottom: 24, containLabel: true },
};

const X_AXIS = {
  axisLine:  { lineStyle: { color: '#1F2630' } },
  axisLabel: { color: '#8B98A6' },
  axisTick:  { show: false },
};

const Y_AXIS = {
  axisLine:  { show: false },
  axisTick:  { show: false },
  splitLine: { lineStyle: { color: '#1F2630' } },
  axisLabel: { color: '#8B98A6' },
};

const TOOLTIP = {
  trigger: 'axis',
  backgroundColor: '#0F1419',
  borderColor: '#283040',
  borderWidth: 1,
  textStyle: { color: '#E6EDF3', fontFamily: 'Inter', fontSize: 12 },
  padding: [8, 12],
};

function mount(el) {
  const c = echarts.init(el, null, { renderer: 'svg' });
  window.addEventListener('resize', () => c.resize());
  return c;
}

export function lineChart(el, { x, series, yMin, yMax, valueFormatter }) {
  const c = mount(el);
  c.setOption({
    ...BASE,
    tooltip: { ...TOOLTIP, valueFormatter },
    legend: { textStyle: { color: '#8B98A6' }, top: 0, right: 0, icon: 'roundRect', itemWidth: 8, itemHeight: 8 },
    xAxis: { ...X_AXIS, type: 'category', data: x, boundaryGap: false,
      axisLabel: { ...X_AXIS.axisLabel, interval: x.length > 20 ? 'auto' : 0, rotate: x.length > 12 ? 45 : 0 } },
    yAxis: { ...Y_AXIS, type: 'value',
      ...(yMin != null ? { min: yMin } : {}),
      ...(yMax != null ? { max: yMax } : {}),
      ...(valueFormatter ? { axisLabel: { ...Y_AXIS.axisLabel, formatter: valueFormatter } } : {}) },
    series: series.map(s => ({
      ...s, type: 'line', smooth: true, showSymbol: false,
      areaStyle: { opacity: 0.12 }, lineStyle: { width: 2 },
    })),
  });
  return c;
}

export function barChart(el, { categories, values, color }) {
  const c = mount(el);
  c.setOption({
    ...BASE,
    tooltip: { ...TOOLTIP, axisPointer: { type: 'shadow' } },
    xAxis: { ...X_AXIS, type: 'category', data: categories, axisLabel: { ...X_AXIS.axisLabel, interval: 0, rotate: categories.length > 5 ? 25 : 0 } },
    yAxis: { ...Y_AXIS, type: 'value' },
    series: [{
      type: 'bar', data: values,
      itemStyle: { color: color || PALETTE[0], borderRadius: [4, 4, 0, 0] },
      barMaxWidth: 32,
    }],
  });
  return c;
}

export function stackedBarChart(el, { categories, series, formatter }) {
  const c = mount(el);
  c.setOption({
    ...BASE,
    tooltip: {
      ...TOOLTIP,
      axisPointer: { type: 'shadow' },
      valueFormatter: formatter || (v => Number(v).toLocaleString()),
    },
    legend: {
      textStyle: { color: '#8B98A6' },
      top: 0, right: 0, icon: 'roundRect',
      itemWidth: 8, itemHeight: 8,
    },
    xAxis: {
      ...X_AXIS, type: 'category', data: categories,
      axisLabel: { ...X_AXIS.axisLabel, interval: categories.length > 20 ? 'auto' : 0, rotate: categories.length > 12 ? 45 : 0 },
    },
    yAxis: { ...Y_AXIS, type: 'value' },
    series: series.map((s, i) => ({
      name: s.name,
      type: 'bar',
      stack: 'total',
      data: s.values,
      itemStyle: { color: s.color || PALETTE[i % PALETTE.length] },
      barMaxWidth: 24,
      emphasis: { focus: 'series' },
    })),
  });
  return c;
}

export function groupedBarChart(el, { categories, series, formatter }) {
  const c = mount(el);
  c.setOption({
    ...BASE,
    tooltip: {
      ...TOOLTIP,
      axisPointer: { type: 'shadow' },
      valueFormatter: formatter || (v => Number(v).toLocaleString()),
    },
    legend: {
      textStyle: { color: '#8B98A6' },
      top: 0, right: 0, icon: 'roundRect',
      itemWidth: 8, itemHeight: 8,
    },
    xAxis: {
      ...X_AXIS, type: 'category', data: categories,
      axisLabel: { ...X_AXIS.axisLabel, interval: 0, rotate: categories.length > 5 ? 25 : 0 },
    },
    yAxis: { ...Y_AXIS, type: 'value' },
    series: series.map((s, i) => ({
      name: s.name,
      type: 'bar',
      data: s.values,
      itemStyle: { color: s.color || PALETTE[i % PALETTE.length], borderRadius: [4, 4, 0, 0] },
      barMaxWidth: 24,
      emphasis: { focus: 'series' },
    })),
  });
  return c;
}

// Calendar contribution heatmap (GitHub-style) with log-spaced color bins.
// data: [[ 'YYYY-MM-DD', value ], ...]
export function calendarHeatmap(el, { data, formatter }) {
  const c = mount(el);
  if (!data || !data.length) {
    c.setOption({ title: { text: 'no data in range', left: 'center', top: 'center',
      textStyle: { color: '#5A6573', fontSize: 12, fontFamily: 'Inter' } } });
    return c;
  }
  const fmtVal = formatter || (v => Number(v).toLocaleString());
  const max = Math.max(...data.map(d => d[1] || 0));
  const start = data[0][0], end = data[data.length - 1][0];

  // Log-spaced thresholds (base 3) → 5 active bins + an empty bin for 0.
  const EMPTY = '#10161d';
  const RAMP  = ['#0e3b27', '#15663f', '#1f9657', '#34c172', '#5fe994'];
  const t = [max / 81, max / 27, max / 9, max / 3].map(x => Math.max(1, Math.round(x)));
  const pieces = [
    { min: 0, max: 0.5, color: EMPTY },
    { min: 0.5, max: t[0], color: RAMP[0] },
    { min: t[0], max: t[1], color: RAMP[1] },
    { min: t[1], max: t[2], color: RAMP[2] },
    { min: t[2], max: t[3], color: RAMP[3] },
    { min: t[3], color: RAMP[4] },
  ];

  c.setOption({
    tooltip: {
      ...TOOLTIP, trigger: 'item',
      formatter: p => `${p.data[0]}<br/><b>${fmtVal(p.data[1])}</b> tokens`,
    },
    visualMap: {
      type: 'piecewise', pieces, showLabel: false, itemWidth: 12, itemHeight: 12,
      orient: 'horizontal', right: 4, bottom: 0,
      text: ['More', 'Less'], textStyle: { color: '#8B98A6', fontSize: 11 },
    },
    calendar: {
      top: 24, left: 30, right: 12, bottom: 34,
      cellSize: ['auto', 14],
      range: [start, end],
      itemStyle: { color: EMPTY, borderColor: '#0A0E14', borderWidth: 2 },
      splitLine: { show: false },
      yearLabel: { show: false },
      monthLabel: { color: '#8B98A6', fontSize: 11 },
      dayLabel: { color: '#5A6573', fontSize: 10, firstDay: 0,
        nameMap: ['S', 'M', 'T', 'W', 'T', 'F', 'S'] },
    },
    series: [{ type: 'heatmap', coordinateSystem: 'calendar', data }],
  });
  return c;
}

// Daily total line + rolling-average overlay, with a linear/log y-axis toggle.
// Returns the chart; call chart.toggleLog() to switch scale (returns new state).
export function dailyTrendChart(el, { categories, totals, movingAvg, avgLabel }) {
  const c = mount(el);
  let log = false;
  const masked = arr => log ? arr.map(v => (v > 0 ? v : null)) : arr;
  function apply() {
    c.setOption({
      ...BASE,
      tooltip: { ...TOOLTIP, valueFormatter: v => (v == null ? '—' : Number(v).toLocaleString()) },
      legend: { textStyle: { color: '#8B98A6' }, top: 0, right: 0, icon: 'roundRect', itemWidth: 8, itemHeight: 8 },
      xAxis: { ...X_AXIS, type: 'category', data: categories, boundaryGap: false,
        axisLabel: { ...X_AXIS.axisLabel, interval: categories.length > 20 ? 'auto' : 0, rotate: categories.length > 12 ? 45 : 0 } },
      yAxis: { ...Y_AXIS, type: log ? 'log' : 'value', min: log ? 1 : 0 },
      series: [
        { name: 'daily total', type: 'line', smooth: true, showSymbol: false,
          data: masked(totals), areaStyle: { opacity: log ? 0 : 0.12 }, lineStyle: { width: 2 }, color: '#4A9EFF' },
        { name: avgLabel || 'rolling avg', type: 'line', smooth: true, showSymbol: false,
          data: masked(movingAvg), lineStyle: { width: 2 }, color: '#E8A23B' },
      ],
    }, { notMerge: true });
  }
  apply();
  c.toggleLog = () => { log = !log; apply(); return log; };
  return c;
}

// Tiny inline sparkline (no axes/labels) for table cells.
export function sparkline(el, values, color = '#4A9EFF') {
  const c = echarts.init(el, null, { renderer: 'svg' });
  c.setOption({
    grid: { left: 1, right: 1, top: 2, bottom: 2 },
    xAxis: { type: 'category', show: false, boundaryGap: false, data: values.map((_, i) => i) },
    yAxis: { type: 'value', show: false, min: 0 },
    tooltip: { show: false },
    series: [{
      type: 'line', data: values, showSymbol: false, smooth: true,
      lineStyle: { width: 1.5, color },
      areaStyle: { opacity: 0.16, color },
    }],
  });
  return c;
}

export function donutChart(el, data) {
  const c = mount(el);
  c.setOption({
    color: PALETTE,
    tooltip: {
      trigger: 'item',
      backgroundColor: '#0F1419', borderColor: '#283040', borderWidth: 1,
      textStyle: { color: '#E6EDF3', fontFamily: 'Inter' },
      formatter: p => `${p.name}<br/><b>${Number(p.value).toLocaleString()}</b> tokens (${p.percent.toFixed(1)}%)`,
    },
    legend: {
      textStyle: { color: '#8B98A6' },
      bottom: 10, icon: 'roundRect', itemWidth: 8, itemHeight: 8,
      type: 'scroll',
    },
    series: [{
      type: 'pie',
      center: ['50%', '44%'],
      radius: ['48%', '68%'],
      avoidLabelOverlap: true,
      padAngle: 2,
      itemStyle: { borderColor: '#0F1419', borderWidth: 2, borderRadius: 4 },
      label: {
        show: true,
        position: 'inside',
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        formatter: ({ percent }) => percent >= 6 ? percent.toFixed(0) + '%' : '',
      },
      labelLine: { show: false },
      data,
    }],
  });
  return c;
}
