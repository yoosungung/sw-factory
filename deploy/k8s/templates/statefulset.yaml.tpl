apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: cursor-agent-{{NAME}}
  namespace: leantime
  labels:
    app: cursor-agent
    agent: {{NAME}}
    persona: {{PERSONA}}
spec:
  serviceName: cursor-agents
  replicas: 1
  selector:
    matchLabels:
      app: cursor-agent
      agent: {{NAME}}
  template:
    metadata:
      labels:
        app: cursor-agent
        agent: {{NAME}}
        persona: {{PERSONA}}
    spec:
      serviceAccountName: cursor-agent
      imagePullSecrets:
        - name: ghcr-pull
      initContainers:
        - name: seed-persona
          image: busybox:1.36
          command:
            - sh
            - -c
            - |
              for src in /persona/*; do
                [ -f "$src" ] || continue
                key=$(basename "$src")
                dest="$key"
                case "$key" in
                  *__*)
                    dest=$(echo "$key" | sed 's/__/\//g' | sed 's/^_dot_/./')
                    ;;
                esac
                mkdir -p "/cursor-home/$(dirname "$dest")"
                cp "$src" "/cursor-home/$dest"
              done
          volumeMounts:
            - name: cursor-home
              mountPath: /cursor-home
            - name: persona
              mountPath: /persona
              readOnly: true
        - name: git-clone
          image: alpine/git:2.45.2
          env:
            - name: GIT_REPO_URL
              value: "{{GIT_REPO}}"
            - name: GH_TOKEN
              valueFrom:
                secretKeyRef:
                  name: cursor-api-key
                  key: {{GH_TOKEN_SECRET_KEY}}
                  optional: true
            - name: GH_TOKEN_OVERRIDE
              valueFrom:
                secretKeyRef:
                  name: cursor-api-key
                  key: GH_TOKEN_{{NAME}}
                  optional: true
          command:
            - sh
            - -c
            - |
              if [ -z "$GIT_REPO_URL" ]; then
                echo "GIT_REPO_URL empty, skipping clone"
                exit 0
              fi
              if [ ! -d /workspace/repo/.git ]; then
                CLONE_URL="$GIT_REPO_URL"
                TOKEN="${GH_TOKEN_OVERRIDE:-$GH_TOKEN}"
                if [ -n "$TOKEN" ]; then
                  CLONE_URL=$(printf '%s' "$GIT_REPO_URL" | sed "s#https://#https://x-access-token:${TOKEN}@#")
                fi
                git clone --depth=1 "$CLONE_URL" /workspace/repo
              fi
          volumeMounts:
            - name: workspace
              mountPath: /workspace
      containers:
        - name: agent-runner
          image: {{RUNNER_IMAGE}}
          imagePullPolicy: Always
          env:
            - name: CURSOR_API_KEY
              valueFrom:
                secretKeyRef:
                  name: cursor-api-key
                  key: CURSOR_API_KEY
            - name: LEANTIME_ACCESS_TOKEN
              valueFrom:
                secretKeyRef:
                  name: cursor-api-key
                  key: LEANTIME_ACCESS_TOKEN_{{NAME}}
            - name: AGENT_RUNNER_MODEL
              value: "{{MODEL}}"
            - name: AGENT_NAME
              value: "{{NAME}}"
            - name: AGENT_EMAIL
              value: "{{EMAIL}}"
            - name: KUBERNETES_NAMESPACE
              value: leantime
            - name: GH_TOKEN
              valueFrom:
                secretKeyRef:
                  name: cursor-api-key
                  key: {{GH_TOKEN_SECRET_KEY}}
            - name: GH_TOKEN_OVERRIDE
              valueFrom:
                secretKeyRef:
                  name: cursor-api-key
                  key: GH_TOKEN_{{NAME}}
                  optional: true
            - name: HOME
              value: /cursor-home
            - name: WORKSPACE
              value: /workspace/repo
          ports:
            - containerPort: 8080
              name: http
          readinessProbe:
            httpGet:
              path: /healthz
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
          volumeMounts:
            - name: cursor-home
              mountPath: /cursor-home
            - name: workspace
              mountPath: /workspace
      volumes:
        - name: persona
          configMap:
            name: persona-{{PERSONA}}
  volumeClaimTemplates:
    - metadata:
        name: cursor-home
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 5Gi
    - metadata:
        name: workspace
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 10Gi
