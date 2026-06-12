const buttonBaseClass =
  "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

export const primaryButtonClass = [
  buttonBaseClass,
  "bg-slate-900 text-white hover:bg-slate-700",
  "h-10 px-3 text-sm",
].join(" ");

export const secondaryButtonClass = [
  buttonBaseClass,
  "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  "h-10 px-3 text-sm",
].join(" ");

export const dangerButtonClass = [
  buttonBaseClass,
  "border border-red-200 bg-white text-red-600 hover:bg-red-50",
  "h-10 px-3 text-sm",
].join(" ");

export const smallSecondaryButtonClass = [
  buttonBaseClass,
  "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
  "h-8 px-2 text-xs",
].join(" ");

export const smallDangerButtonClass = [
  "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  "border border-red-200 bg-white text-red-600 hover:bg-red-50",
  "h-8 px-2 text-xs",
].join(" ");

export const ghostButtonClass = [
  buttonBaseClass,
  "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
  "h-8 px-2 text-sm",
].join(" ");
