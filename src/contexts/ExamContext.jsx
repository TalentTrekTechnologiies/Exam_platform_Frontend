// src/contexts/ExamContext.jsx
import React, { createContext, useState, useContext, useEffect } from "react";
import questionsData from "../data/questions.json";
import settingsData from "../data/settings.json";

const ExamContext = createContext();

export const useExam = () => useContext(ExamContext);

export const ExamProvider = ({ children }) => {
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [markedForReview, setMarkedForReview] = useState({});
  const [examSettings, setExamSettings] = useState({
    examTitle: "Mock EAMCET Exam",
    duration: 180,
    passingScore: 35,
    totalQuestions: 160,
    instructions: "Standard EAMCET Instructions",
    physicsCount: 40,
    chemistryCount: 40,
    mathsCount: 80,
    correctMark: 1,
    negativeMark: 0,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [timeLeft, setTimeLeft] = useState(180 * 60);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

  useEffect(() => {
    fetchData();
    
    const savedAnswers = localStorage.getItem("exam_answers");
    const savedMarked = localStorage.getItem("exam_marked");
    const savedTime = localStorage.getItem("exam_time_left");

    if (savedAnswers) setAnswers(JSON.parse(savedAnswers));
    if (savedMarked) setMarkedForReview(JSON.parse(savedMarked));
    if (savedTime && !isSubmitted) setTimeLeft(parseInt(savedTime));
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('admin_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      // Fetch Questions
      const qRes = await fetch(`${API_URL}/admin/questions`, { headers });
      if (qRes.ok) {
        const qData = await qRes.json();
        setQuestions(qData);
      }

      // Fetch Settings
      const sRes = await fetch(`${API_URL}/admin/settings`, { headers });
      if (sRes.ok) {
        const sData = await sRes.json();
        if (sData.id) {
          setExamSettings(sData);
          setTimeLeft(sData.duration * 60);
        }
      }
    } catch (error) {
      console.error("Error fetching exam data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isSubmitted) {
      localStorage.setItem("exam_answers", JSON.stringify(answers));
      localStorage.setItem("exam_marked", JSON.stringify(markedForReview));
      localStorage.setItem("exam_time_left", timeLeft.toString());
    }
  }, [answers, markedForReview, timeLeft, isSubmitted]);

  const saveAnswer = (questionId, answer) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const toggleMarkForReview = (questionId) => {
    setMarkedForReview((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
  };

  const submitExam = () => {
    setIsSubmitted(true);
    localStorage.removeItem("exam_answers");
    localStorage.removeItem("exam_marked");
    localStorage.removeItem("exam_time_left");
  };

  const resetExam = () => {
    setAnswers({});
    setMarkedForReview({});
    setTimeLeft(examSettings.duration * 60);
    setIsSubmitted(false);
  };

  const updateQuestion = async (updatedQuestion) => {
    const token = localStorage.getItem('admin_token');
    const response = await fetch(`${API_URL}/admin/questions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updatedQuestion)
    });
    if (response.ok) {
      const data = await response.json();
      setQuestions((prev) => prev.map((q) => (q.id === data.id ? data : q)));
    }
  };

  const addQuestion = async (newQuestion) => {
    const token = localStorage.getItem('admin_token');
    const response = await fetch(`${API_URL}/admin/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(newQuestion)
    });
    if (response.ok) {
      const data = await response.json();
      setQuestions((prev) => [...prev, data]);
    }
  };

  const bulkAddQuestions = async (questionsList) => {
    const token = localStorage.getItem('admin_token');
    const response = await fetch(`${API_URL}/admin/questions/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(questionsList)
    });
    if (response.ok) {
      const data = await response.json();
      setQuestions((prev) => [...prev, ...data]);
    }
  };

  const deleteQuestion = async (questionId) => {
    const token = localStorage.getItem('admin_token');
    const response = await fetch(`${API_URL}/admin/questions/${questionId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
      setQuestions((prev) => prev.filter((q) => q.id !== questionId));
    }
  };

  const updateSettings = async (newSettings) => {
    const token = localStorage.getItem('admin_token');
    const response = await fetch(`${API_URL}/admin/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(newSettings)
    });
    if (response.ok) {
      const data = await response.json();
      setExamSettings(data);
      setTimeLeft(data.duration * 60);
    }
  };

  return (
    <ExamContext.Provider
      value={{
        questions,
        answers,
        markedForReview,
        examSettings,
        timeLeft,
        loading,
        setTimeLeft,
        isSubmitted,
        saveAnswer,
        toggleMarkForReview,
        submitExam,
        resetExam,
        updateQuestion,
        addQuestion,
        bulkAddQuestions,
        deleteQuestion,
        updateSettings,
        refreshData: fetchData
      }}
    >
      {!loading && children}
    </ExamContext.Provider>
  );
};