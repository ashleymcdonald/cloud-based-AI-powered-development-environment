// Claude Code Manager Frontend
class ClaudeManager {
    constructor() {
        this.socket = null;
        this.currentProject = null;
        this.projects = [];
        this.credentials = [];
        this.currentTab = 'projects';
        
        this.init();
    }

    async init() {
        // Initialize Socket.IO
        this.socket = io();
        this.setupSocketEvents();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Load initial data
        await this.loadProjects();
        await this.loadCredentials();
        
        // Setup periodic updates
        this.setupPeriodicUpdates();
    }

    setupSocketEvents() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
            document.getElementById('connection-status').textContent = 'Connected';
            document.querySelector('.navbar-text .bi').className = 'bi bi-circle-fill text-success';
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            document.getElementById('connection-status').textContent = 'Disconnected';
            document.querySelector('.navbar-text .bi').className = 'bi bi-circle-fill text-danger';
        });

        this.socket.on('message', (message) => {
            this.addChatMessage(message);
        });

        this.socket.on('project-status-update', (data) => {
            this.updateProjectStatus(data.projectId, data.status);
        });
    }

    setupEventListeners() {
        // Tab switching
        document.getElementById('projects-tab').addEventListener('click', (e) => {
            e.preventDefault();
            this.switchTab('projects');
        });
        
        document.getElementById('credentials-tab').addEventListener('click', (e) => {
            e.preventDefault();
            this.switchTab('credentials');
        });
        
        document.getElementById('monitoring-tab').addEventListener('click', (e) => {
            e.preventDefault();
            this.switchTab('monitoring');
        });

        // Project creation
        document.getElementById('create-project-btn').addEventListener('click', () => {
            this.showCreateProjectModal();
        });
        
        document.getElementById('save-project-btn').addEventListener('click', () => {
            this.createProject();
        });

        // Credential creation
        document.getElementById('create-credential-btn').addEventListener('click', () => {
            this.showCreateCredentialModal();
        });
        
        document.getElementById('save-credential-btn').addEventListener('click', () => {
            this.createCredential();
        });

        // Credential type switching
        document.getElementById('credential-type').addEventListener('change', (e) => {
            this.toggleCredentialFields(e.target.value);
        });

        // Chat functionality
        document.getElementById('send-chat-btn').addEventListener('click', () => {
            this.sendChatMessage();
        });
        
        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });

        // Auto-generate short name from git URL
        document.getElementById('git-repository').addEventListener('input', (e) => {
            const shortNameInput = document.getElementById('project-short-name');
            if (!shortNameInput.value) {
                const repoName = this.extractRepoName(e.target.value);
                shortNameInput.value = repoName;
            }
        });
    }

    setupPeriodicUpdates() {
        // Refresh projects every 30 seconds
        setInterval(() => {
            if (this.currentTab === 'projects') {
                this.loadProjects();
            }
        }, 30000);
        
        // Refresh monitoring data every 10 seconds
        setInterval(() => {
            if (this.currentTab === 'monitoring') {
                this.loadMonitoringData();
            }
        }, 10000);
    }

    switchTab(tab) {
        // Update active tab
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.getElementById(`${tab}-tab`).classList.add('active');

        // Show/hide content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('d-none');
        });
        document.getElementById(`${tab}-content`).classList.remove('d-none');

        this.currentTab = tab;

        // Load tab-specific data
        if (tab === 'monitoring') {
            this.loadMonitoringData();
        }
    }

    // Project Management
    async loadProjects() {
        try {
            const response = await fetch('/api/projects');
            const result = await response.json();
            
            if (result.success) {
                this.projects = result.data.projects;
                this.renderProjects();
            } else {
                this.showAlert('Failed to load projects: ' + result.error, 'danger');
            }
        } catch (error) {
            console.error('Failed to load projects:', error);
            this.showAlert('Failed to load projects', 'danger');
        }
    }

    renderProjects() {
        const container = document.getElementById('projects-list');
        const loading = document.getElementById('projects-loading');
        const empty = document.getElementById('projects-empty');

        loading.classList.add('d-none');

        if (this.projects.length === 0) {
            container.classList.add('d-none');
            empty.classList.remove('d-none');
            return;
        }

        empty.classList.add('d-none');
        container.classList.remove('d-none');

        container.innerHTML = this.projects.map(project => `
            <div class="project-card card mb-3 ${this.currentProject?.id === project.id ? 'selected' : ''}" 
                 data-project-id="${project.id}" onclick="app.selectProject('${project.id}')">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            <h5 class="card-title mb-1">${this.escapeHtml(project.name)}</h5>
                            <p class="card-text text-muted mb-2">${this.escapeHtml(project.gitRepository)}</p>
                            
                            <div class="project-urls mb-2">
                                ${project.urls ? `
                                    <a href="${project.urls.vscode}" target="_blank" class="url-button url-vscode">
                                        <i class="bi bi-code-slash"></i> VS Code
                                    </a>
                                    <a href="${project.urls.agentapi}" target="_blank" class="url-button url-agentapi">
                                        <i class="bi bi-robot"></i> API
                                    </a>
                                ` : ''}
                            </div>
                            
                            <small class="text-muted">
                                Created ${new Date(project.createdAt).toLocaleDateString()}
                            </small>
                        </div>
                        
                        <div class="text-end">
                            <span class="status-badge status-${project.status}">${project.status}</span>
                            <div class="mt-2">
                                <button class="btn btn-sm btn-outline-primary" onclick="app.refreshProject('${project.id}')">
                                    <i class="bi bi-arrow-clockwise"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-success" onclick="app.openChat('${project.id}')">
                                    <i class="bi bi-chat-dots"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-danger" onclick="app.deleteProject('${project.id}')">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    selectProject(projectId) {
        this.currentProject = this.projects.find(p => p.id === projectId);
        this.renderProjects(); // Re-render to show selection
        this.showProjectDetails();
    }

    showProjectDetails() {
        if (!this.currentProject) return;

        const panel = document.getElementById('project-details');
        panel.classList.remove('d-none');
        
        panel.querySelector('.card-body').innerHTML = `
            <h6>${this.escapeHtml(this.currentProject.name)}</h6>
            <p class="text-muted mb-3">${this.escapeHtml(this.currentProject.gitRepository)}</p>
            
            <div class="mb-3">
                <strong>Status:</strong> 
                <span class="status-badge status-${this.currentProject.status}">${this.currentProject.status}</span>
            </div>
            
            <div class="mb-3">
                <strong>Namespace:</strong> ${this.currentProject.namespace}
            </div>
            
            ${this.currentProject.deploymentStatus ? `
                <div class="mb-3">
                    <strong>Deployment:</strong> ${this.currentProject.deploymentStatus.phase}
                    ${this.currentProject.deploymentStatus.message ? `<br><small class="text-muted">${this.currentProject.deploymentStatus.message}</small>` : ''}
                </div>
            ` : ''}
            
            <div class="d-grid gap-2">
                <button class="btn btn-primary btn-sm" onclick="app.openChat('${this.currentProject.id}')">
                    <i class="bi bi-chat-dots"></i> Open Chat
                </button>
                <button class="btn btn-outline-secondary btn-sm" onclick="app.viewLogs('${this.currentProject.id}')">
                    <i class="bi bi-file-text"></i> View Logs
                </button>
                <button class="btn btn-outline-primary btn-sm" onclick="app.refreshProject('${this.currentProject.id}')">
                    <i class="bi bi-arrow-clockwise"></i> Refresh Status
                </button>
            </div>
        `;
    }

    async refreshProject(projectId) {
        try {
            const response = await fetch(`/api/projects/${projectId}/refresh`, {
                method: 'POST'
            });
            const result = await response.json();
            
            if (result.success) {
                await this.loadProjects();
                this.showAlert('Project status refreshed', 'success');
            } else {
                this.showAlert('Failed to refresh project: ' + result.error, 'danger');
            }
        } catch (error) {
            console.error('Failed to refresh project:', error);
            this.showAlert('Failed to refresh project', 'danger');
        }
    }

    async deleteProject(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;

        if (!confirm(`Are you sure you want to delete project "${project.name}"? This action cannot be undone.`)) {
            return;
        }

        try {
            const response = await fetch(`/api/projects/${projectId}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            
            if (result.success) {
                await this.loadProjects();
                this.showAlert('Project deleted successfully', 'success');
                
                // Hide details panel if this project was selected
                if (this.currentProject?.id === projectId) {
                    this.currentProject = null;
                    document.getElementById('project-details').classList.add('d-none');
                    document.getElementById('chat-panel').classList.add('d-none');
                }
            } else {
                this.showAlert('Failed to delete project: ' + result.error, 'danger');
            }
        } catch (error) {
            console.error('Failed to delete project:', error);
            this.showAlert('Failed to delete project', 'danger');
        }
    }

    showCreateProjectModal() {
        // Reset form
        document.getElementById('create-project-form').reset();
        
        // Load git credentials
        this.loadCredentialsForSelect();
        
        // Show modal
        new bootstrap.Modal(document.getElementById('createProjectModal')).show();
    }

    async createProject() {
        const form = document.getElementById('create-project-form');
        const formData = new FormData(form);
        
        const projectData = {
            name: document.getElementById('project-name').value,
            shortName: document.getElementById('project-short-name').value,
            gitRepository: document.getElementById('git-repository').value,
            gitCredentialId: document.getElementById('git-credential').value || undefined,
            anthropicApiKey: document.getElementById('anthropic-api-key').value,
            codeServerPassword: document.getElementById('code-server-password').value,
            sudoPassword: document.getElementById('sudo-password').value,
            jiraProjectKeys: document.getElementById('jira-project-keys').value
                ? document.getElementById('jira-project-keys').value.split(',').map(s => s.trim())
                : undefined
        };

        // Show loading state
        const saveBtn = document.getElementById('save-project-btn');
        const spinner = saveBtn.querySelector('.spinner-border');
        spinner.classList.remove('d-none');
        saveBtn.disabled = true;

        try {
            const response = await fetch('/api/projects', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(projectData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Close modal
                bootstrap.Modal.getInstance(document.getElementById('createProjectModal')).hide();
                
                // Reload projects
                await this.loadProjects();
                
                this.showAlert('Project created successfully', 'success');
            } else {
                this.showAlert('Failed to create project: ' + result.error, 'danger');
            }
        } catch (error) {
            console.error('Failed to create project:', error);
            this.showAlert('Failed to create project', 'danger');
        } finally {
            // Reset loading state
            spinner.classList.add('d-none');
            saveBtn.disabled = false;
        }
    }

    // Git Credentials Management
    async loadCredentials() {
        try {
            const response = await fetch('/api/git-credentials');
            const result = await response.json();
            
            if (result.success) {
                this.credentials = result.data;
                this.renderCredentials();
            }
        } catch (error) {
            console.error('Failed to load credentials:', error);
        }
    }

    renderCredentials() {
        const container = document.getElementById('credentials-list');
        
        if (this.credentials.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5">
                    <i class="bi bi-key display-4 text-muted"></i>
                    <h4 class="mt-3 text-muted">No credentials configured</h4>
                    <p class="text-muted">Add git credentials to access private repositories</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.credentials.map(cred => `
            <div class="card mb-3">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <h6 class="card-title">${this.escapeHtml(cred.name)}</h6>
                            <p class="card-text">
                                <span class="badge bg-secondary">${cred.provider}</span>
                                <span class="badge bg-info">${cred.type}</span>
                            </p>
                            <small class="text-muted">Created ${new Date(cred.createdAt).toLocaleDateString()}</small>
                        </div>
                        <button class="btn btn-sm btn-outline-danger" onclick="app.deleteCredential('${cred.id}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    loadCredentialsForSelect() {
        const select = document.getElementById('git-credential');
        select.innerHTML = '<option value="">Select credential (optional for public repos)</option>';
        
        this.credentials.forEach(cred => {
            const option = document.createElement('option');
            option.value = cred.id;
            option.textContent = `${cred.name} (${cred.provider} - ${cred.type})`;
            select.appendChild(option);
        });
    }

    showCreateCredentialModal() {
        document.getElementById('create-credential-form').reset();
        this.toggleCredentialFields('token');
        new bootstrap.Modal(document.getElementById('createCredentialModal')).show();
    }

    toggleCredentialFields(type) {
        const tokenFields = document.getElementById('token-fields');
        const sshFields = document.getElementById('ssh-fields');
        
        if (type === 'ssh-key') {
            tokenFields.classList.add('d-none');
            sshFields.classList.remove('d-none');
        } else {
            tokenFields.classList.remove('d-none');
            sshFields.classList.add('d-none');
        }
    }

    async createCredential() {
        const credentialData = {
            name: document.getElementById('credential-name').value,
            provider: document.getElementById('credential-provider').value,
            type: document.getElementById('credential-type').value,
        };

        if (credentialData.type === 'token') {
            credentialData.token = document.getElementById('credential-token').value;
        } else {
            credentialData.sshPrivateKey = document.getElementById('ssh-private-key').value;
            credentialData.sshPublicKey = document.getElementById('ssh-public-key').value;
        }

        try {
            const response = await fetch('/api/git-credentials', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(credentialData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                bootstrap.Modal.getInstance(document.getElementById('createCredentialModal')).hide();
                await this.loadCredentials();
                this.showAlert('Credential created successfully', 'success');
            } else {
                this.showAlert('Failed to create credential: ' + result.error, 'danger');
            }
        } catch (error) {
            console.error('Failed to create credential:', error);
            this.showAlert('Failed to create credential', 'danger');
        }
    }

    async deleteCredential(credentialId) {
        const credential = this.credentials.find(c => c.id === credentialId);
        if (!credential) return;

        if (!confirm(`Are you sure you want to delete credential "${credential.name}"?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/git-credentials/${credentialId}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            
            if (result.success) {
                await this.loadCredentials();
                this.showAlert('Credential deleted successfully', 'success');
            } else {
                this.showAlert('Failed to delete credential: ' + result.error, 'danger');
            }
        } catch (error) {
            console.error('Failed to delete credential:', error);
            this.showAlert('Failed to delete credential', 'danger');
        }
    }

    // Chat Interface
    openChat(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;

        this.currentProject = project;
        
        // Join project room
        this.socket.emit('join-project', projectId);
        
        // Show chat panel
        const chatPanel = document.getElementById('chat-panel');
        chatPanel.classList.remove('d-none');
        
        document.getElementById('chat-project-name').textContent = project.name;
        
        // Clear messages
        document.getElementById('chat-messages').innerHTML = `
            <div class="chat-message system">
                Connected to ${project.name}. You can now send messages to Claude.
            </div>
        `;
        
        // Focus input
        document.getElementById('chat-input').focus();
    }

    sendChatMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        
        if (!message || !this.currentProject) return;
        
        // Add user message to chat
        this.addChatMessage({
            type: 'user',
            content: message,
            timestamp: new Date()
        });
        
        // Send to server
        this.socket.emit('send-message', {
            projectId: this.currentProject.id,
            message: message
        });
        
        // Clear input
        input.value = '';
    }

    addChatMessage(message) {
        const container = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${message.type}`;
        
        messageDiv.innerHTML = `
            <div>${this.escapeHtml(message.content)}</div>
            <div class="chat-timestamp">${new Date(message.timestamp).toLocaleTimeString()}</div>
        `;
        
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    }

    // Monitoring
    async loadMonitoringData() {
        try {
            const response = await fetch('/api/system/status');
            const result = await response.json();
            
            if (result.success) {
                this.updateMonitoringDisplay(result.data);
            }
        } catch (error) {
            console.error('Failed to load monitoring data:', error);
        }
    }

    updateMonitoringDisplay(data) {
        // Update project counts
        const projects = this.projects;
        const stats = {
            total: projects.length,
            running: projects.filter(p => p.status === 'running').length,
            stopped: projects.filter(p => p.status === 'stopped').length,
            error: projects.filter(p => p.status === 'error').length
        };

        document.getElementById('total-projects').textContent = stats.total;
        document.getElementById('running-projects').textContent = stats.running;
        document.getElementById('stopped-projects').textContent = stats.stopped;
        document.getElementById('error-projects').textContent = stats.error;
    }

    async viewLogs(projectId) {
        try {
            const response = await fetch(`/api/projects/${projectId}/logs?lines=100`);
            const result = await response.json();
            
            if (result.success) {
                // Show logs in a modal or new window
                this.showLogsModal(result.data.logs);
            } else {
                this.showAlert('Failed to load logs: ' + result.error, 'danger');
            }
        } catch (error) {
            console.error('Failed to load logs:', error);
            this.showAlert('Failed to load logs', 'danger');
        }
    }

    showLogsModal(logs) {
        // Create and show logs modal
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Project Logs</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="logs-container">
                            ${this.escapeHtml(logs)}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        const modalInstance = new bootstrap.Modal(modal);
        modalInstance.show();
        
        // Remove modal from DOM when hidden
        modal.addEventListener('hidden.bs.modal', () => {
            document.body.removeChild(modal);
        });
    }

    // Utility functions
    extractRepoName(gitUrl) {
        const match = gitUrl.match(/\/([^\/]+?)(?:\.git)?$/);
        return match ? match[1].toLowerCase() : '';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showAlert(message, type = 'info') {
        // Create alert element
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        alert.style.cssText = 'top: 20px; right: 20px; z-index: 1050; min-width: 300px;';
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(alert);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (alert.parentNode) {
                alert.parentNode.removeChild(alert);
            }
        }, 5000);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ClaudeManager();
});

// Make some functions globally available for onclick handlers
window.showCreateProjectModal = () => app.showCreateProjectModal();