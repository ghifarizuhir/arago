"use client";

import { useState } from "react";
import { SearchWithDropdown } from "./SearchWithDropdown";

interface TopicStepProps {
  onNext: (data: { topic: string; standardIds: string[] }) => void;
  initialData?: {
    topic?: string;
    standardIds?: string[];
  };
}

export function TopicStep({ onNext, initialData }: TopicStepProps) {
  const [topic, setTopic] = useState(initialData?.topic || "");
  const [selectedStandardIds, setSelectedStandardIds] = useState<string[]>(
    initialData?.standardIds || []
  );
  const [error, setError] = useState<string>("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!topic.trim()) {
      setError("Topic is required");
      return;
    }

    if (topic.length < 3) {
      setError("Topic must be at least 3 characters");
      return;
    }

    if (topic.length > 500) {
      setError("Topic must be no more than 500 characters");
      return;
    }

    onNext({
      topic: topic.trim(),
      standardIds: selectedStandardIds,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold mb-2">Assessment Topic</h2>
        <p className="text-gray-600 mb-6">
          Describe the topic for this assessment. Optionally select standards
          to align with.
        </p>
      </div>

      {/* Topic Input */}
      <div>
        <label htmlFor="topic" className="block text-sm font-medium mb-2">
          Topic *
        </label>
        <textarea
          id="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="E.g., Quadratic equations, Photosynthesis, American Revolution..."
          className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
        />
        <div className="text-xs text-gray-500 mt-1">
          {topic.length}/500 characters
        </div>
      </div>

      {/* Standards Selection */}
      <div>
        <label className="block text-sm font-medium mb-2">Standards</label>
        <p className="text-xs text-gray-600 mb-3">
          Search and select relevant standards for this assessment (optional)
        </p>
        <SearchWithDropdown
          value={selectedStandardIds}
          onChange={setSelectedStandardIds}
          placeholder="Search by code or description (e.g., CCSS.MATH.4.OA)..."
        />
        <div className="text-xs text-gray-600 mt-2">
          {selectedStandardIds.length} standard{selectedStandardIds.length !== 1 ? "s" : ""} selected
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Submit Button */}
      <div className="flex gap-3">
        <button
          type="submit"
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
        >
          Continue
        </button>
      </div>
    </form>
  );
}
