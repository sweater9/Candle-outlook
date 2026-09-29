import React from "react";

export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center text-center p-10">
      {Icon && <Icon className="w-8 h-8 text-slate-300 mb-3" strokeWidth={1.5} />}
      <h3 className="font-semibold text-slate-700">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-400 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
