# System Architecture

## Goal

Build an AI short-drama generation platform.

Input:

- novel chapter
- story outline
- user idea

Output:

- short-drama script
- characters
- scenes
- storyboards
- image prompts
- video prompts
- generated images
- generated videos
- TTS audio
- subtitles
- final episode video

## Main Pipeline

novel text
↓
chapter event extraction
↓
script rewriting
↓
character / scene / prop extraction
↓
storyboard generation
↓
image prompt / video prompt generation
↓
image generation
↓
video generation
↓
TTS / subtitle generation
↓
single-shot composition
↓
episode merge

## Core Layers

1. Frontend workbench
2. API service
3. Agent orchestration
4. Memory system
5. Skill loader
6. Provider adapter
7. Task system
8. Database
9. Object storage
10. FFmpeg composition

## MVP Scope

The MVP should prioritize:

1. novel import
2. event extraction
3. script generation
4. asset extraction
5. storyboard generation
6. editable storyboard workbench

Do not start with complex canvas, timeline, or full video editor.