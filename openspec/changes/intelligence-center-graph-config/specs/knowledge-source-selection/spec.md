# Spec Delta

## Purpose

Lets signed-in users pick the knowledge context of the Intelligence Center — workspace, datasets, and assistant — from one place, using only the resources their workspace is authorized to bind, with several datasets visible at once.

## ADDED Requirements

### Requirement: The Center presents one unified context row

The Intelligence Center SHALL present a single context row above the dashboard grid that contains the workspace selector, the dataset selection, and the assistant selector, together with the authorized-source status. The workspace selector MUST NOT be duplicated in the page header.

#### Scenario: Signed-in user with a selected workspace
- **WHEN** a signed-in user has a workspace selected
- **THEN** the context row shows that workspace, its bound datasets, its bound assistants, and an authorized-source status line

#### Scenario: Signed-in user without any workspace
- **WHEN** a signed-in user has no workspace selected or belongs to no workspace
- **THEN** the context row prompts the user to select a workspace (or contact an administrator) and offers no selectable datasets

#### Scenario: Anonymous visitor
- **WHEN** a visitor has no active session
- **THEN** the context row prompts the user to sign in and offers no workspace, dataset, or assistant selection

### Requirement: Selectable datasets come from workspace bindings

The Center's selectable dataset list SHALL be the dataset bindings of the selected workspace, and the Center MUST NOT offer datasets that are not bound to that workspace, including for site-admins, even when additional datasets exist in the connected RAGFlow instance.

#### Scenario: Site-admin with partially bound RAGFlow datasets
- **WHEN** a site-admin opens a workspace whose bindings reference 2 of the 10 datasets in RAGFlow
- **THEN** the Center offers exactly those 2 bound datasets and none of the unbound ones

#### Scenario: Workspace without dataset bindings
- **WHEN** a signed-in user opens a workspace with no dataset bindings
- **THEN** the Center shows an explicit empty state for datasets instead of a loading or error state

### Requirement: Users select several datasets of the workspace at once

The Center SHALL let a user select multiple bound datasets simultaneously, up to a configurable maximum number of concurrent datasets (default 3). Attempting to select more than the maximum MUST be refused with feedback explaining the limit, and the user MUST be able to deselect datasets at any time.

#### Scenario: Selecting up to the maximum
- **WHEN** a user selects datasets one by one up to the maximum
- **THEN** every selected dataset contributes to the rendered graph

#### Scenario: Exceeding the maximum
- **WHEN** a user tries to select one more dataset while the maximum is already selected
- **THEN** the Center refuses the selection and explains the concurrent-dataset limit

#### Scenario: Lowering the maximum below the current selection
- **WHEN** the user lowers the concurrent-dataset maximum below the number of datasets already selected
- **THEN** the selection is reduced to the new maximum, dropping the most recently selected datasets

### Requirement: The primary dataset drives chat and the URL

The first selected dataset SHALL be the primary dataset. The existing `dataset` URL parameter SHALL reflect the primary dataset, and chat queries SHALL use the primary dataset as their knowledge source. When the primary dataset is deselected, the next-oldest selected dataset SHALL become the primary.

#### Scenario: Two datasets selected
- **WHEN** a user selects dataset A and then dataset B
- **THEN** the `dataset` URL parameter is A and chat queries are answered from dataset A

#### Scenario: Primary dataset deselected
- **WHEN** a user deselects the primary dataset while other datasets remain selected
- **THEN** the next-oldest selected dataset becomes the primary and the `dataset` URL parameter is updated to it

#### Scenario: No dataset selected
- **WHEN** no dataset is selected
- **THEN** the `dataset` URL parameter is absent and chat submission is refused with a message telling the user to select a dataset in the Center

### Requirement: Context resets on session and workspace changes

The Center SHALL clear the knowledge context (datasets, graph, and conversation) when the session ends or the workspace changes, and dataset selection MUST NOT carry over between workspaces or sessions.

#### Scenario: Session expires
- **WHEN** a graph or dataset request returns an authorization failure
- **THEN** the Center clears the knowledge context and prompts the user to sign in again

#### Scenario: Workspace switched
- **WHEN** the user switches to a different workspace
- **THEN** the dataset selection resets and only the new workspace's bound datasets are offered
