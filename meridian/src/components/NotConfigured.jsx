import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";

export default function NotConfigured({ message }) {
  return (
    <div className="bg-amber-50 ring-1 ring-amber-200 rounded-2xl p-5 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
      <div>
        <h3 className="font-semibold text-amber-800 text-sm">Data provider not configured</h3>
        <p className="mt-1 text-sm text-amber-700">{message || "Set the provider API key in the server environment."} <Link to="/settings" className="underline">Open Settings</Link></p>
      </div>
    </div>
  );
}
