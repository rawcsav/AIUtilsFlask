"""cascade delete on chat tables

Revision ID: 447d3301e5e4
Revises: e7c184986a70
Create Date: 2023-12-04 02:52:43.077832

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '447d3301e5e4'
down_revision = 'e7c184986a70'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('conversations', schema=None) as batch_op:
        batch_op.add_column(sa.Column('system_prompt', sa.String(length=2048), nullable=True))

    with op.batch_alter_table('document_chunks', schema=None) as batch_op:
        batch_op.drop_constraint('document_chunks_ibfk_1', type_='foreignkey')
        batch_op.create_foreign_key(None, 'documents', ['document_id'], ['id'], ondelete='CASCADE')

    with op.batch_alter_table('document_embeddings', schema=None) as batch_op:
        batch_op.drop_constraint('document_embeddings_ibfk_2', type_='foreignkey')
        batch_op.create_foreign_key(None, 'document_chunks', ['chunk_id'], ['id'], ondelete='CASCADE')

    with op.batch_alter_table('documents', schema=None) as batch_op:
        batch_op.drop_index('fk_documents_user')

    with op.batch_alter_table('messages', schema=None) as batch_op:
        batch_op.drop_constraint('messages_ibfk_1', type_='foreignkey')
        batch_op.create_foreign_key(None, 'conversations', ['conversation_id'], ['id'], ondelete='CASCADE')

    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('messages', schema=None) as batch_op:
        batch_op.drop_constraint(None, type_='foreignkey')
        batch_op.create_foreign_key('messages_ibfk_1', 'conversations', ['conversation_id'], ['id'])

    with op.batch_alter_table('documents', schema=None) as batch_op:
        batch_op.create_index('fk_documents_user', ['user_id'], unique=False)

    with op.batch_alter_table('document_embeddings', schema=None) as batch_op:
        batch_op.drop_constraint(None, type_='foreignkey')
        batch_op.create_foreign_key('document_embeddings_ibfk_2', 'document_chunks', ['chunk_id'], ['id'])

    with op.batch_alter_table('document_chunks', schema=None) as batch_op:
        batch_op.drop_constraint(None, type_='foreignkey')
        batch_op.create_foreign_key('document_chunks_ibfk_1', 'documents', ['document_id'], ['id'])

    with op.batch_alter_table('conversations', schema=None) as batch_op:
        batch_op.drop_column('system_prompt')

    # ### end Alembic commands ###