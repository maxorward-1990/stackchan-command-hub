import { createFileRoute } from "@tanstack/react-router";
import { TodoCard } from "@/components/hub/TodoCard";
import { hubHead } from "@/lib/hub-head";

export const Route = createFileRoute("/tasks")({
  head: () => hubHead("Att-göra", "Hantera att-göra-listan som delas med StackChans röstassistent."),
  component: TodoCard,
});
