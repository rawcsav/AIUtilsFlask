"""download token, refactoring

Revision ID: 6d23368f9407
Revises: f1c2a1efa136
Create Date: 2024-01-15 03:44:23.155923

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '6d23368f9407'
down_revision = 'f1c2a1efa136'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('transcription_jobs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('download_timestamp', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('download_url', sa.String(length=255), nullable=True))

    with op.batch_alter_table('translation_jobs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('download_timestamp', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('download_url', sa.String(length=255), nullable=True))

    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('translation_jobs', schema=None) as batch_op:
        batch_op.drop_column('download_url')
        batch_op.drop_column('download_timestamp')

    with op.batch_alter_table('transcription_jobs', schema=None) as batch_op:
        batch_op.drop_column('download_url')
        batch_op.drop_column('download_timestamp')

    # ### end Alembic commands ###
