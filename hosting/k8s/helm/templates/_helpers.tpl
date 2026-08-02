{{- define "cascade.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "cascade.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "cascade.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "cascade.labels" -}}
app.kubernetes.io/name: {{ include "cascade.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "cascade.selectorLabels" -}}
app.kubernetes.io/name: {{ include "cascade.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "cascade.deploymentRunnerServiceAccountName" -}}
{{- if .Values.deploymentRunner.serviceAccount.create -}}
{{- default (printf "%s-deployment-runner" (include "cascade.fullname" .)) .Values.deploymentRunner.serviceAccount.name -}}
{{- else -}}
{{- required "deploymentRunner.serviceAccount.name is required when service account creation is disabled" .Values.deploymentRunner.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "cascade.runtimeSecretName" -}}
{{- required "runtimeSecret.existingSecret is required" .Values.runtimeSecret.existingSecret -}}
{{- end -}}

{{- define "cascade.apiSecretName" -}}
{{- required "apiSecret.existingSecret is required" .Values.apiSecret.existingSecret -}}
{{- end -}}

{{- define "cascade.dashboardSecretName" -}}
{{- required "dashboardSecret.existingSecret is required" .Values.dashboardSecret.existingSecret -}}
{{- end -}}

{{- define "cascade.postgresSecretName" -}}
{{- required "postgres.auth.existingSecret is required when postgres.enabled is true" .Values.postgres.auth.existingSecret -}}
{{- end -}}

{{- define "cascade.redisSecretName" -}}
{{- required "redis.auth.existingSecret is required when redis.enabled is true" .Values.redis.auth.existingSecret -}}
{{- end -}}

{{- define "cascade.rustfsSecretName" -}}
{{- required "rustfs.auth.existingSecret is required when rustfs.enabled is true" .Values.rustfs.auth.existingSecret -}}
{{- end -}}

{{- define "cascade.telemetryEnv" -}}
{{- if .root.Values.telemetry.enabled }}
- name: OTEL_ENABLED
  value: "true"
- name: OTEL_EXPORTER_MODE
  value: otlp
- name: OTEL_EXPORTER_OTLP_ENDPOINT
  value: {{ required "telemetry.endpoint is required when telemetry.enabled is true" .root.Values.telemetry.endpoint | quote }}
- name: OTEL_DEPLOYMENT_ENVIRONMENT
  value: {{ .root.Values.telemetry.deploymentEnvironment | quote }}
- name: OTEL_METRIC_EXPORT_INTERVAL_MS
  value: {{ .root.Values.telemetry.metricExportIntervalMs | quote }}
- name: CASCADE_VERSION
  value: {{ .root.Chart.AppVersion | quote }}
- name: OTEL_SERVICE_NAME
  value: {{ .serviceName | quote }}
{{- end }}
{{- end }}