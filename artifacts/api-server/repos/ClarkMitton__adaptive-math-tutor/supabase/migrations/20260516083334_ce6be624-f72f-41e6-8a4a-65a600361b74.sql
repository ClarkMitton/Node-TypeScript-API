DELETE FROM public.question_attempts WHERE sub_topic_result_id IN (
  SELECT str.id FROM public.sub_topic_results str
  JOIN public.scan_sessions ss ON ss.id = str.session_id
  WHERE ss.student_id = 'b7c7a7be-0a74-435a-b4e2-582e57638dcf'
);
DELETE FROM public.sub_topic_results WHERE session_id IN (
  SELECT id FROM public.scan_sessions WHERE student_id = 'b7c7a7be-0a74-435a-b4e2-582e57638dcf'
);
DELETE FROM public.scan_sessions WHERE student_id = 'b7c7a7be-0a74-435a-b4e2-582e57638dcf';