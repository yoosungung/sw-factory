apiVersion: v1
kind: Service
metadata:
  name: cursor-agent-{{NAME}}
  namespace: leantime
  labels:
    app: cursor-agent
    agent: {{NAME}}
spec:
  selector:
    app: cursor-agent
    agent: {{NAME}}
  ports:
    - name: http
      port: 8080
      targetPort: http
