-- Fase 9: a conferência da Mina aponta para a tarefa concluída que ela confere.

ALTER TABLE tasks ADD COLUMN review_of TEXT REFERENCES tasks(id);
CREATE INDEX tasks_review_of ON tasks(review_of);
