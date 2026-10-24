"""Fit an affine mapping from reviewed control point pairs; never apply automatically.
Input JSON: {from_source,to_source,revision,control_points:[[[x,y],[u,v]],...]}
Output remains pending; a second graphical review is required before application.
"""
import json,sys,sqlite3,uuid,numpy as np
from pathlib import Path
value=json.loads(Path(sys.argv[1]).read_text());pairs=np.array(value['control_points'],dtype=float)
if pairs.ndim!=3 or pairs.shape[1:]!=(2,2) or len(pairs)<3 or not np.isfinite(pairs).all():raise ValueError('At least three finite pairs required')
a=np.column_stack((pairs[:,0],np.ones(len(pairs))));b=pairs[:,1]
if np.linalg.matrix_rank(a)<3:raise ValueError('Collinear control points')
matrix=np.linalg.lstsq(a,b,rcond=None)[0];residual=float(np.sqrt(np.mean(np.sum((a@matrix-b)**2,axis=1))))
record={**value,'id':str(uuid.uuid4()),'matrix':matrix.T.tolist(),'residual':residual,'status':'pending'}
if len(sys.argv)>2:
 db=sqlite3.connect(sys.argv[2]);db.execute('PRAGMA foreign_keys=ON')
 with db:db.execute('INSERT INTO atlas_transforms VALUES(?,?,?,?,?,?,?,?)',(record['id'],record['from_source'],record['to_source'],record['revision'],json.dumps(record['control_points']),json.dumps(record['matrix']),residual,'pending'))
print(json.dumps(record))
