INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('resumes','resumes',false,5000000,ARRAY['application/octet-stream','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=5000000,allowed_mime_types=EXCLUDED.allowed_mime_types;
-- No public storage policies: server-authorized signed URLs only.
