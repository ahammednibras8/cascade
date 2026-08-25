import { Form, Link, useNavigation } from "react-router";
import type { ReactNode } from "react";
import { isObjectStorageRef } from "./format";
import type { Schedule, ScheduleActionData, ScheduleTask } from "./types";

type ScheduleFormProps = {
  actionData: ScheduleActionData;
  tasks?: ScheduleTask[];
  schedule?: Schedule;
};

export function NewSchedulePage(
  props: Omit<ScheduleFormProps, "schedule"> & { tasks: ScheduleTask[] },
) {
  const navigation = useNavigation();

  return (
    <ScheduleFormLayout
      title="New schedule"
      description="Create an interval or cron schedule for a registered task."
    >
      <ScheduleForm
        {...props}
        isSubmitting={navigation.state === "submitting"}
        submitLabel="Create schedule"
        submittingLabel="Creating schedule..."
      />
    </ScheduleFormLayout>
  );
}

export function EditSchedulePage(props: Omit<ScheduleFormProps, "tasks"> & { schedule: Schedule }) {
  const navigation = useNavigation();

  return (
    <ScheduleFormLayout
      title="Edit schedule"
      description={
        <>
          {props.schedule.task.name}{" "}
          <span className="font-mono text-sm">({props.schedule.task.slug})</span>
        </>
      }
    >
      <ScheduleForm
        {...props}
        isSubmitting={navigation.state === "submitting"}
        submitLabel="Save schedule"
        submittingLabel="Saving..."
      />
    </ScheduleFormLayout>
  );
}

function ScheduleFormLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-6">
        <Link to="/schedules" className="text-sm text-blue-700 hover:underline">
          Back to schedules
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-gray-600">{description}</p>
      </div>
      {children}
    </main>
  );
}

function ScheduleForm({
  actionData,
  isSubmitting,
  tasks,
  schedule,
  submitLabel,
  submittingLabel,
}: ScheduleFormProps & {
  isSubmitting: boolean;
  submitLabel: string;
  submittingLabel: string;
}) {
  const payloadIsStoredExternally = schedule ? isObjectStorageRef(schedule.payload) : false;

  return (
    <Form method="post" className="space-y-5 rounded-lg border border-gray-200 bg-white p-6">
      {tasks ? <TaskSelect tasks={tasks} /> : null}
      <TextInput name="name" label="Name" defaultValue={schedule?.name} />
      <ScheduleRuleFields schedule={schedule} />
      <PayloadField
        initialPayload={getInitialPayload(schedule, payloadIsStoredExternally)}
        isStoredExternally={payloadIsStoredExternally}
        label={schedule ? "Replacement payload JSON" : "Payload JSON"}
      />

      <ClearPayloadField schedule={schedule} />
      <ActionError actionData={actionData} />
      <SubmitButton
        disabled={isSubmitting || tasks?.length === 0}
        label={isSubmitting ? submittingLabel : submitLabel}
      />
      <EmptyTasksMessage tasks={tasks} />
    </Form>
  );
}

function getInitialPayload(schedule: Schedule | undefined, payloadIsStoredExternally: boolean) {
  if (!schedule || schedule.payload === null || payloadIsStoredExternally) {
    return "";
  }

  return JSON.stringify(schedule.payload, null, 2);
}

function ClearPayloadField({ schedule }: { schedule: Schedule | undefined }) {
  if (!schedule) {
    return null;
  }

  return (
    <label className="flex items-center gap-2 text-sm text-gray-800">
      <input type="checkbox" name="clearPayload" value="true" />
      Clear the payload
    </label>
  );
}

function ActionError({ actionData }: { actionData: ScheduleActionData }) {
  if (actionData?.ok !== false) {
    return null;
  }

  return (
    <p role="alert" className="text-sm text-red-700">
      {actionData.error.message}
    </p>
  );
}

function SubmitButton({ disabled, label }: { disabled: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
    >
      {label}
    </button>
  );
}

function EmptyTasksMessage({ tasks }: { tasks: ScheduleTask[] | undefined }) {
  if (tasks?.length !== 0) {
    return null;
  }

  return <p className="text-sm text-amber-700">Register a task before creating a schedule.</p>;
}

function TaskSelect({ tasks }: { tasks: ScheduleTask[] }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-800">Task</span>
      <select
        name="taskId"
        required
        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      >
        <option value="">Select a task</option>
        {tasks.map((task) => (
          <option key={task.id} value={task.id}>
            {task.name} ({task.slug})
          </option>
        ))}
      </select>
    </label>
  );
}

function TextInput({
  name,
  label,
  defaultValue,
  help,
  max,
  min,
  placeholder = "Weekday morning report",
  type = "text",
}: {
  name: string;
  label: string;
  defaultValue: string | undefined;
  help?: string;
  max?: number;
  min?: number;
  placeholder?: string;
  type?: "number" | "text";
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-800">{label}</span>
      <input
        name={name}
        type={type}
        required={Boolean(defaultValue)}
        min={min}
        max={max}
        maxLength={200}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      />
      {help ? <span className="mt-1 block text-xs text-gray-500">{help}</span> : null}
    </label>
  );
}

function ScheduleRuleFields({ schedule }: { schedule: Schedule | undefined }) {
  return (
    <>
      <label className="block">
        <span className="text-sm font-medium text-gray-800">Schedule type</span>
        <select
          name="scheduleType"
          defaultValue={schedule?.scheduleType ?? "INTERVAL"}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="INTERVAL">Interval</option>
          <option value="CRON">Cron</option>
        </select>
      </label>
      <TextInput
        name="intervalSeconds"
        label="Interval seconds"
        type="number"
        min={60}
        max={31_536_000}
        defaultValue={String(schedule?.intervalSeconds ?? 60)}
        help="Used for interval schedules. Minimum: 60 seconds."
      />
      <TextInput
        name="cronExpression"
        label="Cron expression"
        defaultValue={schedule?.cronExpression ?? ""}
        placeholder="0 9 * * 1-5"
        help="Used for cron schedules. Five fields: minute hour day-of-month month day-of-week."
      />
      <TextInput
        name="timezone"
        label="Timezone"
        defaultValue={schedule?.timezone ?? "UTC"}
        placeholder="Asia/Kolkata"
      />
    </>
  );
}

function PayloadField({
  initialPayload,
  isStoredExternally,
  label,
}: {
  initialPayload: string;
  isStoredExternally: boolean;
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-800">{label}</span>
      <textarea
        name="payloadJson"
        rows={7}
        defaultValue={initialPayload}
        placeholder={'{\n  "customerId": "customer-1"\n}'}
        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
      />
      {isStoredExternally ? (
        <span className="mt-1 block text-sm text-amber-700">
          The current large payload is stored in RustFS. Leave blank to preserve it.
        </span>
      ) : null}
    </label>
  );
}
