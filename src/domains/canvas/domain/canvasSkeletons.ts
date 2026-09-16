import type { CreateElementInput } from "@/domains/canvas/domain/canvasTools";

export const CANVAS_SKELETON_KINDS = [
  "bar_chart",
  "cash_flow",
  "steps",
  "comparison",
  "timeline",
  "progress",
  "flowchart",
  "decision",
  "loop",
  "line_chart",
  "waterfall",
  "split",
  "accounts",
  "table",
] as const;

export type CanvasSkeletonKind = (typeof CANVAS_SKELETON_KINDS)[number];

export type CanvasSkeletonArgs = {
  kind: CanvasSkeletonKind;
  originX?: number;
  originY?: number;
  slots?: number;
  title?: string;
  prefix?: string;
};

const MIN_SLOTS = 3;
const MAX_SLOTS = 8;
const DEFAULT_ORIGIN_X = 80;
const DEFAULT_ORIGIN_Y = 80;

const DEFAULT_TITLES: Record<CanvasSkeletonKind, string> = {
  bar_chart: "Where money goes",
  cash_flow: "Cash flow",
  steps: "Savings plan",
  comparison: "Budget vs actual",
  timeline: "Paydays and bills",
  progress: "Goal progress",
  flowchart: "Money flow",
  decision: "Should I?",
  loop: "Payday loop",
  line_chart: "Spend over time",
  waterfall: "How the balance moved",
  split: "Needs, wants, save",
  accounts: "Accounts",
  table: "Budget table",
};

function clampSlots(slots: number | undefined) {
  const value = slots ?? 5;
  return Math.min(MAX_SLOTS, Math.max(MIN_SLOTS, Math.round(value)));
}

function refKey(prefix: string, name: string) {
  return prefix ? `${prefix}_${name}` : name;
}

export function buildCanvasSkeleton(args: CanvasSkeletonArgs): {
  elements: CreateElementInput[];
  refs: string[];
  kind: CanvasSkeletonKind;
  slots: number;
} {
  const originX = args.originX ?? DEFAULT_ORIGIN_X;
  const originY = args.originY ?? DEFAULT_ORIGIN_Y;
  const slots = clampSlots(args.slots);
  const prefix = (args.prefix ?? "").trim();
  const title = args.title?.trim() || DEFAULT_TITLES[args.kind];
  const r = (name: string) => refKey(prefix, name);

  const builders: Record<
    CanvasSkeletonKind,
    () => CreateElementInput[]
  > = {
    bar_chart: () => barChart(originX, originY, slots, title, r),
    cash_flow: () => cashFlow(originX, originY, slots, title, r),
    steps: () => steps(originX, originY, slots, title, r),
    comparison: () => comparison(originX, originY, slots, title, r),
    timeline: () => timeline(originX, originY, slots, title, r),
    progress: () => progress(originX, originY, title, r),
    flowchart: () => flowchart(originX, originY, slots, title, r),
    decision: () => decision(originX, originY, title, r),
    loop: () => loop(originX, originY, title, r),
  };

  const elements = builders[args.kind]();
  const refs = elements
    .map((element) => element.ref)
    .filter((value): value is string => Boolean(value));

  return { elements, refs, kind: args.kind, slots };
}

function barChart(
  originX: number,
  originY: number,
  slots: number,
  title: string,
  r: (name: string) => string,
): CreateElementInput[] {
  const labelX = originX;
  const barX = originX + 336;
  const barMaxW = 360;
  const barH = 80;
  const gap = 20;
  const firstY = originY + 56;
  const elements: CreateElementInput[] = [
    {
      type: "text",
      ref: r("title"),
      x: originX,
      y: originY,
      text: title,
      fontSize: 36,
      font: "heading",
    },
  ];

  for (let i = 0; i < slots; i += 1) {
    const n = i + 1;
    const y = firstY + i * (barH + gap);
    const barW = Math.max(80, Math.round(barMaxW * (1 - i * 0.12)));
    const group = r(`row_${n}`);
    elements.push(
      {
        type: "text",
        ref: r(`cat_${n}`),
        x: labelX,
        y: y + 24,
        text: `Item ${n}`,
        fontSize: 20,
        font: "hand",
        group,
      },
      {
        type: "rectangle",
        ref: r(`bar_${n}`),
        x: barX,
        y,
        w: barW,
        h: barH,
        rounded: true,
        fill: i === 0 ? "blue-light" : "grey-light",
        group,
      },
      {
        type: "text",
        ref: r(`val_${n}`),
        x: barX + barW + 12,
        y: y + 24,
        text: "—",
        fontSize: 20,
        font: "code",
        group,
      },
    );
  }

  const axisY = firstY + slots * (barH + gap) + 8;
  elements.push({
    type: "line",
    ref: r("axis"),
    x: barX,
    y: axisY,
    points: [
      [0, 0],
      [barMaxW, 0],
    ],
  });

  return elements;
}

function cashFlow(
  originX: number,
  originY: number,
  slots: number,
  title: string,
  r: (name: string) => string,
): CreateElementInput[] {
  const catH = 128;
  const catGap = 36;
  const catW = 400;
  const incomeW = 280;
  const incomeH = 160;
  const catX = originX + 400;
  const firstCatY = originY + 64;
  const stackH = slots * catH + (slots - 1) * catGap;
  const incomeY = firstCatY + Math.max(0, (stackH - incomeH) / 2);
  const totalX = catX + catW + 140;
  const elements: CreateElementInput[] = [
    {
      type: "text",
      ref: r("title"),
      x: originX,
      y: originY,
      text: title,
      fontSize: 36,
      font: "heading",
    },
    {
      type: "ellipse",
      ref: r("income"),
      x: originX,
      y: incomeY,
      w: incomeW,
      h: incomeH,
      text: "Income",
      fontSize: 22,
      font: "hand",
      textAlign: "center",
      verticalAlign: "middle",
      fill: "green-light",
    },
  ];

  for (let i = 0; i < slots; i += 1) {
    const n = i + 1;
    const y = firstCatY + i * (catH + catGap);
    elements.push({
      type: "rectangle",
      ref: r(`cat_${n}`),
      x: catX,
      y,
      w: catW,
      h: catH,
      rounded: true,
      text: `Bucket ${n}`,
      fontSize: 20,
      textAlign: "center",
      verticalAlign: "middle",
      fill: i === 0 ? "violet-light" : "blue-light",
    });
  }

  elements.push({
    type: "ellipse",
    ref: r("total"),
    x: totalX,
    y: incomeY,
    w: incomeW,
    h: incomeH,
      text: "Total",
      fontSize: 22,
    font: "hand",
    textAlign: "center",
    verticalAlign: "middle",
    fill: "grey-light",
  });

  for (let i = 0; i < slots; i += 1) {
    const n = i + 1;
    elements.push(
      {
        type: "arrow",
        ref: r(`in_${n}`),
        from: r("income"),
        to: r(`cat_${n}`),
        route: "elbow",
        label: "—",
      },
      {
        type: "arrow",
        ref: r(`out_${n}`),
        from: r(`cat_${n}`),
        to: r("total"),
        route: "elbow",
      },
    );
  }

  return elements;
}

function steps(
  originX: number,
  originY: number,
  slots: number,
  title: string,
  r: (name: string) => string,
): CreateElementInput[] {
  const boxW = 400;
  const boxH = 144;
  const gap = 56;
  const firstY = originY + 56;
  const children: string[] = [];
  const elements: CreateElementInput[] = [
    {
      type: "text",
      ref: r("title"),
      x: originX,
      y: originY,
      text: title,
      fontSize: 36,
      font: "heading",
    },
  ];

  for (let i = 0; i < slots; i += 1) {
    const n = i + 1;
    const y = firstY + i * (boxH + gap);
    const stepRef = r(`step_${n}`);
    children.push(stepRef);
    elements.push({
      type: "rectangle",
      ref: stepRef,
      x: originX,
      y,
      w: boxW,
      h: boxH,
      rounded: true,
      text: `Step ${n}`,
      fontSize: 22,
      textAlign: "center",
      verticalAlign: "middle",
      fill: "blue-light",
    });
    if (i > 0) {
      elements.push({
        type: "arrow",
        ref: r(`arrow_${n}`),
        from: r(`step_${i}`),
        to: stepRef,
        route: "elbow",
      });
    }
  }

  elements.push({
    type: "frame",
    ref: r("frame"),
    name: title,
    children,
    padding: 28,
  });

  return elements;
}

function comparison(
  originX: number,
  originY: number,
  slots: number,
  title: string,
  r: (name: string) => string,
): CreateElementInput[] {
  const colW = 400;
  const rowH = 128;
  const gapX = 48;
  const gapY = 16;
  const headerY = originY + 56;
  const colAX = originX;
  const colBX = originX + colW + gapX;
  const firstRowY = headerY + 112;
  const elements: CreateElementInput[] = [
    {
      type: "text",
      ref: r("title"),
      x: originX,
      y: originY,
      text: title,
      fontSize: 36,
      font: "heading",
    },
    {
      type: "rectangle",
      ref: r("head_a"),
      x: colAX,
      y: headerY,
      w: colW,
      h: 96,
      rounded: true,
      text: "Budget",
      fontSize: 20,
      font: "heading",
      textAlign: "center",
      verticalAlign: "middle",
      fill: "blue-tint",
    },
    {
      type: "rectangle",
      ref: r("head_b"),
      x: colBX,
      y: headerY,
      w: colW,
      h: 96,
      rounded: true,
      text: "Actual",
      fontSize: 20,
      font: "heading",
      textAlign: "center",
      verticalAlign: "middle",
      fill: "orange-light",
    },
  ];

  for (let i = 0; i < slots; i += 1) {
    const n = i + 1;
    const y = firstRowY + i * (rowH + gapY);
    elements.push(
      {
        type: "rectangle",
        ref: r(`a_${n}`),
        x: colAX,
        y,
        w: colW,
        h: rowH,
        rounded: true,
        text: `Item ${n}`,
        fontSize: 20,
        fill: "grey-light",
      },
      {
        type: "rectangle",
        ref: r(`b_${n}`),
        x: colBX,
        y,
        w: colW,
        h: rowH,
        rounded: true,
        text: "—",
        fontSize: 20,
        font: "code",
        fill: "grey-light",
      },
    );
  }

  return elements;
}

function timeline(
  originX: number,
  originY: number,
  slots: number,
  title: string,
  r: (name: string) => string,
): CreateElementInput[] {
  const lineY = originY + 140;
  const lineW = 720;
  const dot = 16;
  const inset = 40;
  const span = lineW - inset * 2;
  const elements: CreateElementInput[] = [
    {
      type: "text",
      ref: r("title"),
      x: originX,
      y: originY,
      text: title,
      fontSize: 36,
      font: "heading",
    },
    {
      type: "line",
      ref: r("axis"),
      x: originX,
      y: lineY,
      points: [
        [0, 0],
        [lineW, 0],
      ],
      strokeWidth: 2,
    },
  ];

  for (let i = 0; i < slots; i += 1) {
    const n = i + 1;
    const t = slots === 1 ? 0.5 : i / (slots - 1);
    const cx = originX + inset + span * t;
    const group = r(`mark_${n}`);
    elements.push(
      {
        type: "ellipse",
        ref: r(`dot_${n}`),
        x: cx - dot / 2,
        y: lineY - dot / 2,
        w: dot,
        h: dot,
        fill: "blue-light",
        group,
      },
      {
        type: "text",
        ref: r(`date_${n}`),
        x: cx - 40,
        y: lineY - 64,
        text: `Date ${n}`,
        fontSize: 20,
        font: "code",
        textAlign: "center",
        group,
      },
      {
        type: "text",
        ref: r(`event_${n}`),
        x: cx - 48,
        y: lineY + 24,
        text: `Event ${n}`,
        fontSize: 20,
        font: "hand",
        textAlign: "center",
        group,
      },
    );
  }

  return elements;
}

function progress(
  originX: number,
  originY: number,
  title: string,
  r: (name: string) => string,
): CreateElementInput[] {
  const trackY = originY + 72;
  const trackW = 400;
  const trackH = 28;
  const fillW = 160;
  return [
    {
      type: "text",
      ref: r("title"),
      x: originX,
      y: originY,
      text: title,
      fontSize: 36,
      font: "heading",
    },
    {
      type: "rectangle",
      ref: r("track"),
      x: originX,
      y: trackY,
      w: trackW,
      h: trackH,
      rounded: true,
      fill: "grey-light",
    },
    {
      type: "rectangle",
      ref: r("fill"),
      x: originX,
      y: trackY,
      w: fillW,
      h: trackH,
      rounded: true,
      fill: "green-light",
    },
    {
      type: "text",
      ref: r("pct"),
      x: originX + trackW + 16,
      y: trackY + 2,
      text: "40%",
      fontSize: 20,
      font: "code",
    },
  ];
}

function titleText(
  originX: number,
  originY: number,
  title: string,
  ref: string,
): CreateElementInput {
  return {
    type: "text",
    ref,
    x: originX,
    y: originY,
    text: title,
    fontSize: 36,
    font: "heading",
  };
}

function centeredNode(args: {
  type: "rectangle" | "ellipse" | "diamond";
  ref: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fill: string;
  fontSize?: number;
}): CreateElementInput {
  if (args.type === "ellipse") {
    return {
      type: "ellipse",
      ref: args.ref,
      x: args.x,
      y: args.y,
      w: args.w,
      h: args.h,
      text: args.text,
      fontSize: args.fontSize ?? 20,
      font: "hand",
      textAlign: "center",
      verticalAlign: "middle",
      fill: args.fill,
    };
  }
  if (args.type === "diamond") {
    return {
      type: "diamond",
      ref: args.ref,
      x: args.x,
      y: args.y,
      w: args.w,
      h: args.h,
      text: args.text,
      fontSize: args.fontSize ?? 20,
      font: "hand",
      textAlign: "center",
      verticalAlign: "middle",
      fill: args.fill,
    };
  }
  return {
    type: "rectangle",
    ref: args.ref,
    x: args.x,
    y: args.y,
    w: args.w,
    h: args.h,
    rounded: true,
    text: args.text,
    fontSize: args.fontSize ?? 20,
    font: "hand",
    textAlign: "center",
    verticalAlign: "middle",
    fill: args.fill,
  };
}

function flowchart(
  originX: number,
  originY: number,
  slots: number,
  title: string,
  r: (name: string) => string,
): CreateElementInput[] {
  const nodeW = 240;
  const nodeH = 110;
  const gap = 88;
  const rowY = originY + 72;
  const startW = 200;
  const elements: CreateElementInput[] = [
    titleText(originX, originY, title, r("title")),
    centeredNode({
      type: "ellipse",
      ref: r("start"),
      x: originX,
      y: rowY,
      w: startW,
      h: nodeH,
      text: "Start",
      fill: "green-light",
    }),
  ];

  let prev = r("start");
  let x = originX + startW + gap;
  for (let i = 0; i < slots; i += 1) {
    const n = i + 1;
    const stepRef = r(`step_${n}`);
    elements.push(
      centeredNode({
        type: "rectangle",
        ref: stepRef,
        x,
        y: rowY,
        w: nodeW,
        h: nodeH,
        text: `Step ${n}`,
        fill: "blue-light",
      }),
      {
        type: "arrow",
        ref: r(`arrow_${n}`),
        from: prev,
        to: stepRef,
        route: "elbow",
      },
    );
    prev = stepRef;
    x += nodeW + gap;
  }

  const endRef = r("end");
  elements.push(
    centeredNode({
      type: "ellipse",
      ref: endRef,
      x,
      y: rowY,
      w: startW,
      h: nodeH,
      text: "Done",
      fill: "grey-light",
    }),
    {
      type: "arrow",
      ref: r("arrow_end"),
      from: prev,
      to: endRef,
      route: "elbow",
    },
  );

  return elements;
}

function decision(
  originX: number,
  originY: number,
  title: string,
  r: (name: string) => string,
): CreateElementInput[] {
  const boxW = 260;
  const boxH = 110;
  const diamondW = 280;
  const diamondH = 160;
  const colGap = 80;
  const yesX = originX;
  const noX = originX + boxW + colGap;
  const midX = originX + (boxW + colGap) / 2;
  const startY = originY + 72;
  const askY = startY + boxH + 72;
  const branchY = askY + diamondH + 72;
  const endY = branchY + boxH + 72;

  return [
    titleText(originX, originY, title, r("title")),
    centeredNode({
      type: "ellipse",
      ref: r("start"),
      x: midX,
      y: startY,
      w: 200,
      h: boxH,
      text: "Start",
      fill: "green-light",
    }),
    centeredNode({
      type: "diamond",
      ref: r("ask"),
      x: midX - 40,
      y: askY,
      w: diamondW,
      h: diamondH,
      text: "Yes or no?",
      fill: "yellow-light",
      fontSize: 20,
    }),
    centeredNode({
      type: "rectangle",
      ref: r("yes"),
      x: yesX,
      y: branchY,
      w: boxW,
      h: boxH,
      text: "Yes",
      fill: "green-light",
    }),
    centeredNode({
      type: "rectangle",
      ref: r("no"),
      x: noX,
      y: branchY,
      w: boxW,
      h: boxH,
      text: "No",
      fill: "orange-light",
    }),
    centeredNode({
      type: "ellipse",
      ref: r("end"),
      x: midX,
      y: endY,
      w: 200,
      h: boxH,
      text: "Done",
      fill: "grey-light",
    }),
    {
      type: "arrow",
      ref: r("arrow_start"),
      from: r("start"),
      to: r("ask"),
      route: "elbow",
    },
    {
      type: "arrow",
      ref: r("arrow_yes"),
      from: r("ask"),
      to: r("yes"),
      route: "elbow",
      label: "Yes",
    },
    {
      type: "arrow",
      ref: r("arrow_no"),
      from: r("ask"),
      to: r("no"),
      route: "elbow",
      label: "No",
    },
    {
      type: "arrow",
      ref: r("arrow_yes_end"),
      from: r("yes"),
      to: r("end"),
      route: "elbow",
    },
    {
      type: "arrow",
      ref: r("arrow_no_end"),
      from: r("no"),
      to: r("end"),
      route: "elbow",
    },
  ];
}

function loop(
  originX: number,
  originY: number,
  title: string,
  r: (name: string) => string,
): CreateElementInput[] {
  const boxW = 240;
  const boxH = 110;
  const inner = 220;
  const topX = originX + inner;
  const topY = originY + 72;
  const rightX = originX + inner + boxW + 80;
  const midY = topY + boxH + 80;
  const bottomY = midY + boxH + 80;
  const leftX = originX;

  const nodes = [
    { ref: "step_1", x: topX, y: topY, text: "Payday", fill: "green-light" },
    { ref: "step_2", x: rightX, y: midY, text: "Spend", fill: "blue-light" },
    { ref: "step_3", x: topX, y: bottomY, text: "Bills", fill: "violet-light" },
    { ref: "step_4", x: leftX, y: midY, text: "Repeat", fill: "grey-light" },
  ] as const;

  const elements: CreateElementInput[] = [
    titleText(originX, originY, title, r("title")),
  ];
  for (const node of nodes) {
    elements.push(
      centeredNode({
        type: "rectangle",
        ref: r(node.ref),
        x: node.x,
        y: node.y,
        w: boxW,
        h: boxH,
        text: node.text,
        fill: node.fill,
      }),
    );
  }

  const pairs: Array<[string, string, string]> = [
    ["step_1", "step_2", "arrow_1"],
    ["step_2", "step_3", "arrow_2"],
    ["step_3", "step_4", "arrow_3"],
    ["step_4", "step_1", "arrow_4"],
  ];
  for (const [from, to, arrow] of pairs) {
    elements.push({
      type: "arrow",
      ref: r(arrow),
      from: r(from),
      to: r(to),
      route: "curved",
    });
  }

  return elements;
}
