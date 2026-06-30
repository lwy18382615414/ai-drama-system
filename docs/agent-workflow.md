# Agent Workflow Design

## Agent List

- OrchestratorAgent
- NovelAgent
- EventAgent
- ScriptAgent
- ExtractAgent
- CharacterAgent
- StoryboardAgent
- PromptAgent
- ImageAgent
- VideoAgent
- VoiceAgent
- ComposeAgent
- ReviewAgent
- MemoryAgent

## Recommended Control Flow

Do not let Agents freely call each other.

Use OrchestratorAgent to coordinate the workflow:

user action
↓
orchestrator decides current stage
↓
load skill
↓
build context
↓
call target agent
↓
validate output
↓
persist result
↓
log agent run
↓
trigger next task if needed

## Agent Rules

Each Agent must have:

- clear responsibility
- input schema
- output schema
- context builder
- service implementation
- validation
- persistence
- agent_runs logging

## Example: StoryboardAgent

Input:

- project style
- episode script
- characters
- scenes
- previous episode summary
- open hooks

Output:

- storyboards[]

Each storyboard must include:

- shot_no
- duration
- scene_id
- character_ids
- shot_type
- camera_angle
- camera_movement
- action
- dialogue
- image_prompt
- video_prompt

Rules:

- each shot should describe one main action
- each shot should be 5-10 seconds
- do not create undefined characters
- do not change character relationships
- ending should preserve hook