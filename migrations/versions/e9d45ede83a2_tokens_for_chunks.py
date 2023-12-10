"""tokens for chunks

Revision ID: e9d45ede83a2
Revises: a1579c0aa09f
Create Date: 2023-11-24 19:53:06.083515

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e9d45ede83a2'
down_revision = 'a1579c0aa09f'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('document_chunks', schema=None) as batch_op:
        batch_op.add_column(sa.Column('tokens', sa.Integer(), nullable=False))

    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('document_chunks', schema=None) as batch_op:
        batch_op.drop_column('tokens')

    # ### end Alembic commands ###