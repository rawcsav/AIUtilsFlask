"""removed img uuid, just using id

Revision ID: 887ed536d3e2
Revises: 91f55d4f699f
Create Date: 2024-01-07 22:55:15.788904

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision = '887ed536d3e2'
down_revision = '91f55d4f699f'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('generated_images', schema=None) as batch_op:
        batch_op.drop_index('uuid')
        batch_op.drop_column('uuid')

    with op.batch_alter_table('message_chunk_association', schema=None) as batch_op:
        batch_op.drop_constraint('message_chunk_association_ibfk_2', type_='foreignkey')
        batch_op.create_foreign_key(None, 'document_chunks', ['chunk_id'], ['id'], ondelete='CASCADE')

    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('message_chunk_association', schema=None) as batch_op:
        batch_op.drop_constraint(None, type_='foreignkey')
        batch_op.create_foreign_key('message_chunk_association_ibfk_2', 'document_chunks', ['chunk_id'], ['id'])

    with op.batch_alter_table('generated_images', schema=None) as batch_op:
        batch_op.add_column(sa.Column('uuid', mysql.VARCHAR(length=255), nullable=False))
        batch_op.create_index('uuid', ['uuid'], unique=False)