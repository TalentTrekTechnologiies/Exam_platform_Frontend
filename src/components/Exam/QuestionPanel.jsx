import React from "react";
import { uploadUrl } from "../../lib/api";

/**
 * A single question.
 *
 * Options arrive as { id, text, image } where `id` is the canonical letter that
 * gets sent back, so the server's shuffle stays presentational and answers are
 * stable regardless of the order this candidate saw.
 */
const LETTERS = ["A", "B", "C", "D"];

const QuestionPanel = ({ question, currentAnswer, onAnswer, disabled }) => {
  if (!question) return null;

  const questionImage = uploadUrl(question.questionImage);

  return (
    <article className="mx-auto max-w-stem">
      <header className="mb-6 flex items-baseline justify-between gap-6 border-b border-gray-200 pb-4">
        <h2 className="text-[15px] font-semibold text-gray-900">
          Question {question.displayNumber}
        </h2>

        {/* Candidates weigh the penalty before guessing; the scheme stays visible. */}
        <div className="flex items-center gap-4 text-[13px] font-medium tabular">
          <span className="text-status-answered">+{question.marks}</span>
          {question.negativeMarks > 0 && (
            <span className="text-status-unanswered">&minus;{question.negativeMarks}</span>
          )}
        </div>
      </header>

      <div className="text-question whitespace-pre-wrap text-gray-900">
        {question.questionText}
      </div>

      {questionImage && (
        <figure className="mt-6 overflow-hidden rounded-exam border border-gray-200 bg-gray-50 p-4">
          <img
            src={questionImage}
            alt="Question diagram"
            className="mx-auto h-auto max-w-full object-contain"
            style={{ maxHeight: "340px" }}
            onError={(e) => { e.target.style.display = "none"; }}
          />
        </figure>
      )}

      <div className="mt-8 space-y-3" role="radiogroup" aria-label="Answer options">
        {(question.options || []).map((option, index) => {
          const selected = currentAnswer === option.id;
          const optionImage = uploadUrl(option.image);

          return (
            <label
              key={option.id}
              className={`group flex items-start gap-4 rounded-exam border px-5 py-4
                          transition-colors duration-150
                          ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}
                          ${selected
                            ? "border-primary-600 bg-primary-50 ring-1 ring-primary-600"
                            : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"}`}
            >
              <input
                type="radio"
                name={`question-${question.id}`}
                value={option.id}
                checked={selected}
                disabled={disabled}
                onChange={() => onAnswer(option.id)}
                className="sr-only"
              />

              {/* The letter doubles as the radio indicator — one mark, not two. */}
              <span
                aria-hidden="true"
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border
                            text-[13px] font-semibold transition-colors duration-150
                            ${selected
                              ? "border-primary-600 bg-primary-600 text-white"
                              : "border-gray-300 bg-white text-gray-500 group-hover:border-gray-400"}`}
              >
                {LETTERS[index]}
              </span>

              {option.text && (
                <span className={`text-option flex-1 whitespace-pre-wrap pt-0.5
                                  ${selected ? "text-primary-900" : "text-gray-800"}`}>
                  {option.text}
                </span>
              )}

              {optionImage && (
                <img
                  src={optionImage}
                  alt={`Option ${LETTERS[index]}`}
                  className="ml-auto rounded border border-gray-200 bg-white object-contain"
                  style={{ maxHeight: "84px", maxWidth: "170px" }}
                  onError={(e) => { e.target.style.display = "none"; }}
                />
              )}
            </label>
          );
        })}
      </div>
    </article>
  );
};

export default QuestionPanel;
