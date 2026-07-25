import React from "react";
import { QUESTION_STATUS as S } from "../../contexts/ExamContext";
import StatusLegend from "./StatusLegend";

/**
 * The question palette, using the five-state vocabulary from EAMCET / NEET /
 * TCS NQT. Candidates arrive already fluent in it, so the semantics and the
 * colour meanings are conventional; only the execution is ours.
 */

const STYLES = {
  [S.ANSWERED]:        "bg-status-answered text-white border-status-answered",
  [S.NOT_ANSWERED]:    "bg-status-unanswered text-white border-status-unanswered",
  [S.MARKED]:          "bg-status-marked text-white border-status-marked",
  [S.ANSWERED_MARKED]: "bg-status-marked text-white border-status-marked",
  [S.NOT_VISITED]:     "bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:bg-gray-50",
};

const LABELS = {
  [S.ANSWERED]: "answered",
  [S.NOT_ANSWERED]: "not answered",
  [S.MARKED]: "marked for review",
  [S.ANSWERED_MARKED]: "answered and marked for review",
  [S.NOT_VISITED]: "not visited",
};

/** A single palette cell. */
const Cell = ({ number, status, current, onClick }) => (
  <button
    onClick={onClick}
    aria-label={`Question ${number}, ${LABELS[status]}`}
    aria-current={current ? "true" : undefined}
    className={`relative h-9 w-9 rounded-exam border text-[13px] font-semibold tabular
                transition-colors duration-150 ${STYLES[status]}
                ${current ? "ring-2 ring-offset-2 ring-chrome" : ""}`}
  >
    {number}
    {/* The green tick is the one detail candidates look for: a marked question
        that still carries an answer IS evaluated. */}
    {status === S.ANSWERED_MARKED && (
      <span
        aria-hidden="true"
        className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center
                   rounded-full bg-status-answered text-[9px] font-bold text-white
                   ring-2 ring-white"
      >
        ✓
      </span>
    )}
  </button>
);

const QuestionPalette = ({ questions, sections, counts, statusOf, currentIndex, onQuestionClick }) => (
  <div>
    {/* Same component the briefing used, so the vocabulary is identical. */}
    <div className="mb-5 border-b border-gray-200 pb-5">
      <StatusLegend counts={counts} />
    </div>

    {sections.map((section) => (
      <section key={`${section.name}-${section.startIndex}`} className="mb-7">
        <h3 className="exam-label mb-3 flex items-baseline justify-between">
          <span className="text-gray-700">{section.name}</span>
          <span className="tabular text-gray-400">
            {section.tally.answered + section.tally.answeredMarked}/{section.total}
          </span>
        </h3>

        <div className="grid grid-cols-5 gap-2">
          {section.indices.map((index) => (
            <Cell
              key={index}
              number={index + 1}
              status={statusOf(questions[index].id)}
              current={index === currentIndex}
              onClick={() => onQuestionClick(index)}
            />
          ))}
        </div>
      </section>
    ))}
  </div>
);

export default QuestionPalette;
