"""mixins, removed stream

Revision ID: 471944e295ad
Revises: 887ed536d3e2
Create Date: 2024-01-12 15:32:06.869409

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision = '471944e295ad'
down_revision = '887ed536d3e2'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('chat_preferences', schema=None) as batch_op:
        batch_op.drop_column('stream')

    with op.batch_alter_table('messages', schema=None) as batch_op:
        batch_op.drop_index('ix_messages_created_at')

    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('messages', schema=None) as batch_op:
        batch_op.create_index('ix_messages_created_at', ['created_at'], unique=False)

    with op.batch_alter_table('chat_preferences', schema=None) as batch_op:
        batch_op.add_column(sa.Column('stream', mysql.TINYINT(display_width=1), autoincrement=False, nullable=True))

    # ### end Alembic commands ###
