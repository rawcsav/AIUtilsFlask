"""download token, refactoring

Revision ID: f1c2a1efa136
Revises: 26241a5d40ce
Create Date: 2024-01-15 01:24:48.493906

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f1c2a1efa136'
down_revision = '26241a5d40ce'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('transcription_jobs', schema=None) as batch_op:
        batch_op.create_foreign_key(None, 'jobs', ['id'], ['id'])

    with op.batch_alter_table('translation_job_segments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('duration', sa.Float(), nullable=False))

    with op.batch_alter_table('translation_jobs', schema=None) as batch_op:
        batch_op.create_foreign_key(None, 'jobs', ['id'], ['id'])

    with op.batch_alter_table('tts_jobs', schema=None) as batch_op:
        batch_op.create_foreign_key(None, 'jobs', ['id'], ['id'])

    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('tts_jobs', schema=None) as batch_op:
        batch_op.drop_constraint(None, type_='foreignkey')

    with op.batch_alter_table('translation_jobs', schema=None) as batch_op:
        batch_op.drop_constraint(None, type_='foreignkey')

    with op.batch_alter_table('translation_job_segments', schema=None) as batch_op:
        batch_op.drop_column('duration')

    with op.batch_alter_table('transcription_jobs', schema=None) as batch_op:
        batch_op.drop_constraint(None, type_='foreignkey')

    # ### end Alembic commands ###
