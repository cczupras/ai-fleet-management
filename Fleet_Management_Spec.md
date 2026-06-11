# Fleet Management System for AI Agents - Specification

## 1. Executive Summary
The "Fleet Management" system is a centralized platform designed to manage, organize, and assign a fleet of AI agents, skills, prompts, and Model Context Protocol (MCP) configurations. It allows users to orchestrate AI resources on a per-project basis, ensuring consistency, reusability, and continuous autonomous improvement through "Loop Engineering".

## 2. System Architecture

### 2.1. Storage Layer (GitHub)
- **Source of Truth**: All agents, skills, prompts, and configurations are stored in a GitHub repository.
- **Benefits**: Native version control, accessible via the GitHub Mobile App, easy integration with GitHub Actions for automation tasks, and simplified collaboration.

### 2.2. Backend Server
- **Core Engine**: A lightweight backend API to bridge the GUI components and the GitHub storage.
- **Validation**: Contains the business logic to verify that no duplicate skills or agents are created.
- **Automation Pipeline**: Hosts the "Loop Engineering" infrastructure, executing autonomous iteration loops in the background.

### 2.3. Client Interfaces
- **VS Code Extension**: A native graphical user interface (GUI) inside Visual Studio Code for developers to seamlessly pull, assign, and edit agents/skills for their current project.
- **Mobile/Web Access**: A mobile-friendly web app (or deep integration with the GitHub App) allowing users to create new skills, draft prompts, and kick off agent loops on the go.

## 3. Core Features

### 3.1. Fleet & Project Management
- **Resource Registry**: Centralized catalog of all available AI tools, agents, MCPs, and prompts.
- **Project Scoping**: Ability to select and assign a specific subset of the fleet to a given project workspace.

### 3.2. Duplicate Detection
- **Semantic & Exact Matching**: Before saving a new skill or agent, the system checks existing resources.
- **Alerts**: Notifies the user if a highly similar or identical skill/agent already exists, offering to merge or link instead.

### 3.3. Loop Engineering Engine
- **Autonomous Iteration**: Instead of step-by-step user prompting, the system runs autonomous loops where the agent writes, reviews, tests, and refines its own output.
- **Feedback Integration**: The loop operates independently but can accept asynchronous user feedback from the GUI or mobile app to steer the direction.

## 4. Project Management: Epic & Issues

### Epic: AI Fleet Management Platform
**Description**: Build the end-to-end infrastructure, backend, and GUIs to manage AI agents, skills, and MCPs across different projects, integrating autonomous loop engineering and GitHub-based storage.

### Draft GitHub Issues
1. **[Infrastructure] Define GitHub Storage Schema:** Define the JSON/YAML data structures for Agents, Skills, Prompts, and MCP configs to be stored in the repository.
2. **[Backend] Build Core API & GitHub Sync:** Develop the backend service that reads from and writes to the GitHub repository using the GitHub API.
3. **[Backend] Implement Deduplication Engine:** Create the logic to scan existing skills/agents and prevent the creation of duplicates.
4. **[Frontend] Develop VS Code Extension GUI:** Build the webview GUI for VS Code to list, assign, and manage fleet resources per project.
5. **[Frontend] Build Mobile-Friendly Web Dashboard:** Develop a responsive PWA or GitHub App integration for on-the-go fleet management.
6. **[AI/Backend] Implement Loop Engineering Engine:** Build the autonomous execution loop that allows agents to self-iterate and improve without synchronous prompts.
