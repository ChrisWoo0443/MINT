-- Meeting status enum
create type meeting_status as enum ('recording', 'processing', 'completed', 'failed');

-- Meetings table
create table meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default 'Meeting — ' || to_char(now(), 'YYYY-MM-DD HH24:MI'),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status meeting_status not null default 'recording',
  created_at timestamptz not null default now()
);

-- Transcript chunks table
create table transcripts (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) on delete cascade not null,
  speaker text,
  content text not null,
  timestamp_start double precision not null,
  timestamp_end double precision not null,
  created_at timestamptz not null default now()
);

-- Notes table (one per meeting)
create table notes (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) on delete cascade not null unique,
  summary text not null,
  decisions jsonb not null default '[]',
  action_items jsonb not null default '[]',
  raw_gemini_response jsonb,
  created_at timestamptz not null default now()
);

-- RLS policies
alter table meetings enable row level security;
alter table transcripts enable row level security;
alter table notes enable row level security;

create policy "Users can manage their own meetings"
  on meetings for all using (auth.uid() = user_id);

create policy "Users can manage transcripts for their meetings"
  on transcripts for all using (
    meeting_id in (select id from meetings where user_id = auth.uid())
  );

create policy "Users can manage notes for their meetings"
  on notes for all using (
    meeting_id in (select id from meetings where user_id = auth.uid())
  );

-- Indexes
create index idx_meetings_user_id on meetings(user_id);
create index idx_transcripts_meeting_id on transcripts(meeting_id);
create index idx_transcripts_timestamp on transcripts(meeting_id, timestamp_start);
create index idx_notes_meeting_id on notes(meeting_id);
